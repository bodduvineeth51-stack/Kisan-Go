// Daily keep-alive ping (Vercel cron, see vercel.json).
//
// Supabase pauses a free-plan project after about a week with no activity.
// Once a day this makes one tiny read through the public API so the project
// never counts as inactive. It uses the public anon key and reads nothing:
// row-level security returns an empty list to a logged-out caller.
//
// Pings the project this deployment already uses (VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY). To keep a second project awake too (kisan-go-dev),
// add KEEPALIVE_DEV_URL and KEEPALIVE_DEV_ANON_KEY in the Vercel project
// settings; without them only the main project is pinged.
//
// If CRON_SECRET is set in Vercel, only Vercel's own cron call is accepted.

// A table that exists in every Kisan Go database.
const TABLE = 'owners'

async function ping(name, url, key) {
  if (!url || !key) return { name, ok: false, error: 'missing URL or anon key' }
  try {
    const res = await fetch(`${url.trim().replace(/\/+$/, '')}/rest/v1/${TABLE}?select=id&limit=1`, {
      headers: { apikey: key.trim(), Authorization: `Bearer ${key.trim()}` },
      signal: AbortSignal.timeout(15000),
    })
    return { name, ok: res.ok, status: res.status }
  } catch (err) {
    return { name, ok: false, error: String(err?.cause?.code ?? err?.message ?? err) }
  }
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' })
  }

  const targets = [['main', process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY]]
  if (process.env.KEEPALIVE_DEV_URL) {
    targets.push(['dev', process.env.KEEPALIVE_DEV_URL, process.env.KEEPALIVE_DEV_ANON_KEY])
  }

  const results = await Promise.all(targets.map((t) => ping(...t)))
  const ok = results.every((r) => r.ok)
  // A failed ping shows up as an error in the Vercel function logs.
  if (!ok) console.error('keepalive: ping failed', JSON.stringify(results))
  return res.status(ok ? 200 : 500).json({ ok, at: new Date().toISOString(), results })
}
