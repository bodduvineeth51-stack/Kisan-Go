// Money per customer, worked out from work_records. Payment is a
// customer-level flag (customers.is_paid), so a customer either owes all
// their billed amount or nothing.

// id → { billed, due, since } where `since` is the oldest bill still owed.
export function customerBalances(customers, records) {
  const paid = new Map(customers.map((c) => [c.id, c.is_paid]))
  const out = {}
  for (const r of records) {
    if (!paid.has(r.customer_id)) continue
    const b = (out[r.customer_id] ??= { billed: 0, due: 0, since: null })
    const amount = Number(r.amount) || 0
    b.billed += amount
    if (!paid.get(r.customer_id)) {
      b.due += amount
      if (!b.since || r.created_at < b.since) b.since = r.created_at
    }
  }
  return out
}

// Whole days since an ISO date (0 = today).
export function daysSince(iso) {
  if (!iso) return 0
  const then = new Date(iso)
  const now = new Date()
  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate())
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

// Local-time start of today / this week (Monday) — IST-safe, not UTC.
export function periodStart(period, now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'today') return day
  if (period === 'week') {
    const offset = (day.getDay() + 6) % 7 // days since Monday
    return new Date(day.getTime() - offset * 86_400_000)
  }
  return null // season = everything
}
