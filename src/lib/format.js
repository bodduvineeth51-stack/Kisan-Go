// Indian money format: ₹4,583 · ₹48,600 · ₹2,35,000
export function formatMoney(amount) {
  return `₹${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`
}

// Decimal hours → "1h 50m"
export function formatHours(hours) {
  const totalMin = Math.round((Number(hours) || 0) * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}
