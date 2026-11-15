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
