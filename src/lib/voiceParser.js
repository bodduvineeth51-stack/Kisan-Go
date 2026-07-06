const VEHICLE_ALIASES = {
  tractor:   ['tractor', 'tractar', 'trektar', 'tracker', 'traktor', 'ట్రాక్టర్'],
  harvester: ['harvester', 'haravester', 'combine', 'combain', 'combiner', 'హార్వెస్టర్', 'కంబైన్'],
  jcb:       ['jcb', 'j c b', 'జేసీబీ', 'digger', 'excavator'],
  rotavator: ['rotavator', 'rota vator', 'rotavater', 'రోటావేటర్', 'cultivator'],
  sprayer:   ['sprayer', 'spray', 'స్ప్రేయర్'],
  thresher:  ['thresher', 'thresh', 'థ్రెషర్'],
  trailer:   ['trailer', 'ట్రైలర్'],
}

export function findVehicle(text, vehicleTypes) {
  const lower = text.toLowerCase()
  for (const v of vehicleTypes) {
    const key = v.type.toLowerCase()
    if (lower.includes(key)) return v
    const aliases = VEHICLE_ALIASES[key] ?? []
    if (aliases.some(a => lower.includes(a.toLowerCase()) || text.includes(a))) return v
  }
  return null
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 5) return 99
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    }
  }
  return dp[a.length][b.length]
}

export function findCustomer(transcript, customers) {
  const lower = transcript.toLowerCase()
  for (const c of customers) {
    if (lower.includes(c.name.toLowerCase())) return c
  }
  for (const c of customers) {
    const first = c.name.split(/\s+/)[0].toLowerCase()
    if (first.length >= 3 && lower.includes(first)) return c
  }
  const words = lower.split(/[\s,।.]+/).filter(w => w.length >= 3)
  let best = null, bestDist = 3
  for (const c of customers) {
    const first = c.name.split(/\s+/)[0].toLowerCase()
    if (first.length < 3) continue
    for (const word of words) {
      const d = levenshtein(word, first)
      if (d < bestDist) { bestDist = d; best = c }
    }
  }
  return best
}

function parseTimeToken(token) {
  const colonMatch = token.match(/^(\d{1,2}):(\d{2})$/)
  if (colonMatch) return { h: parseInt(colonMatch[1]), m: parseInt(colonMatch[2]) }
  const hourMatch = token.match(/^(\d{1,2})$/)
  if (hourMatch) return { h: parseInt(hourMatch[1]), m: 0 }
  return null
}

export function extractTimes(text) {
  // Normalise Telugu separators: "12 నుండి 2:30 వరకు" → "12 to 2:30"
  const norm = text
    .replace(/నుండి|నుంచి/g, 'to')
    .replace(/వరకు/g, '')
    .toLowerCase()
    .trim()

  // Match: [H:MM] [am|pm]? <to|-|–> [H:MM] [am|pm]?
  const m = norm.match(
    /(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*(?:to|-|–)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?/
  )
  if (!m) return { start: null, stop: null }

  const startTok = parseTimeToken(m[1])
  const stopTok  = parseTimeToken(m[3])
  if (!startTok || !stopTok) return { start: null, stop: null }

  let { h: sh, m: sm } = startTok
  let { h: eh, m: em } = stopTok

  if (m[4] === 'pm' && eh < 12) eh += 12
  if (m[2] === 'am' && sh === 12) sh = 0
  // Auto-PM: if stop appears earlier than start in 12h context, bump stop to PM
  if (eh < sh && eh < 12) eh += 12

  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return { start: null, stop: null }

  const today = new Date()
  const base  = (h, min) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, min, 0)
  const start = base(sh, sm)
  const stop  = base(eh, em)
  if (stop <= start) return { start: null, stop: null }

  return { start: start.toISOString(), stop: stop.toISOString() }
}

export function parseTranscript(transcript, customers, vehicleTypes) {
  return {
    customer: findCustomer(transcript, customers),
    vehicle:  findVehicle(transcript, vehicleTypes),
    ...extractTimes(transcript),
    transcript,
  }
}
