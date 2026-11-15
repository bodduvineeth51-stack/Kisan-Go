export const VEHICLE_TYPES = [
  'Tractor', 'Harvester', 'JCB', 'Rotavator', 'Trailer',
  'Cultivator', 'Seed Drill', 'Sprayer', 'Thresher',
]

// Keep these limits in sync with validate_owner_profile in the database.
export function validateVehicles(vehicles) {
  if (!Array.isArray(vehicles) || vehicles.length === 0) return 'selectVehicleErr'
  const names = new Set()
  for (const vehicle of vehicles) {
    const name = String(vehicle.type ?? '').trim()
    if (!name || name.length > 50) return 'vehicleNameRequired'
    if (names.has(name.toLowerCase())) return 'duplicateVehicle'
    names.add(name.toLowerCase())
    const rate = Number(vehicle.hourly_rate)
    if (!Number.isFinite(rate) || rate <= 0 || rate > 10000000 || Math.abs(rate * 100 - Math.round(rate * 100)) > 0.000001) {
      return 'validRateErr'
    }
  }
  return null
}

export function normalizeVehicles(vehicles) {
  return vehicles.map(v => ({ type: v.type.trim(), hourly_rate: Number(v.hourly_rate) }))
}

// Names for `count` vehicles of one type: one stays "Harvester", several
// become "Harvester 1", "Harvester 2", … so each machine (and its work)
// can be told apart. Vehicle names are what work_records store.
export function numberedNames(type, count) {
  if (count <= 1) return [type]
  return Array.from({ length: count }, (_, i) => `${type} ${i + 1}`)
}

// Last vehicle used on this phone — a driver usually drives the same one,
// so the timer opens with it instead of always picking the first vehicle.
const LAST_VEHICLE_KEY = 'kisan_last_vehicle'
export function lastVehicle() {
  try { return localStorage.getItem(LAST_VEHICLE_KEY) } catch { return null }
}
export function rememberVehicle(name) {
  try { localStorage.setItem(LAST_VEHICLE_KEY, name) } catch { /* storage blocked */ }
}
