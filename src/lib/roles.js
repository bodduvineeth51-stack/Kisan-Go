import { supabase } from './supabaseClient'

// Who is logged in, decided by the database (get_my_role):
//   { role: 'owner',  status: 'active',  business_id, business_name, name, vehicle_rates }
//   { role: 'driver', status: 'active' | 'revoked', … }
//   null → no business yet (owner sign-up form)
//
// One person can be an owner AND a driver for another owner's business. Then
// get_my_role returns both rows, and the side the app is showing is sent to the
// database as the header  x-kisan-mode: driver  so the driver functions work on
// the right business. The header only chooses between the caller's own roles.

let actingAs = 'owner' // the side currently on screen

export function setActingAs(mode) {
  actingAs = mode === 'driver' ? 'driver' : 'owner'
}

const modeKey = (userId) => `kisan_mode_${userId}`
export function savedMode(userId) {
  try {
    const value = localStorage.getItem(modeKey(userId))
    return value === 'driver' || value === 'owner' ? value : null
  } catch {
    return null
  }
}
export function saveMode(userId, mode) {
  try { localStorage.setItem(modeKey(userId), mode) } catch { /* private window: not remembered */ }
}

const rpc = (fn, args, mode = actingAs) => supabase.rpc(fn, args).setHeader('x-kisan-mode', mode)

// claim_driver_invite runs first so a driver the owner just added lands on the
// driver screens on their very first login. It reads the verified phone on the
// server; nothing about the phone is sent from here.
//
// Returns the row for the preferred side (or the only row), with the person's
// other role, if any, as `.other`.
export async function loadMyRole(preferred = actingAs) {
  const claim = await supabase.rpc('claim_driver_invite')
  // Never turn a failed invitation claim into an accidental owner sign-up.
  if (claim.error) throw claim.error

  const { data, error } = await rpc('get_my_role', undefined, preferred)
  if (error) throw error
  const [first, second] = data ?? []
  return first ? { ...first, other: second ?? null } : null
}

// The database said this user may not do this (revoked driver, or a driver
// calling an owner-only function). Phase 2 raises 42501 for these.
export function isNotAllowed(error) {
  if (!error) return false
  if (error.code === '42501') return true
  return /no_access|only_owner|permission denied|not allowed/i.test(error.message ?? '')
}

// Thrown by driver screens so App can switch to the "access removed" screen.
export class AccessRemovedError extends Error {
  constructor() {
    super('access_removed')
    this.name = 'AccessRemovedError'
  }
}

// Call a driver RPC. If the driver has been revoked, throw AccessRemovedError.
//
// The list functions (list_customers_basic, my_work_records,
// find_customer_by_phone) quietly return no rows for a revoked driver instead
// of raising, so for those we also re-check get_my_role in the same round trip.
export async function driverRpc(fn, args, { checkStatus = false } = {}) {
  const [res, roleRes] = await Promise.all([
    rpc(fn, args),
    checkStatus ? rpc('get_my_role') : Promise.resolve(null),
  ])
  if (isNotAllowed(res.error)) throw new AccessRemovedError()
  if (roleRes) {
    if (roleRes.error && isNotAllowed(roleRes.error)) throw new AccessRemovedError()
    if (roleRes.error) throw roleRes.error
    const me = roleRes.data?.[0]
    if (!me || me.role !== 'driver' || me.status !== 'active') {
      throw new AccessRemovedError()
    }
  }
  if (res.error) throw res.error
  return res.data
}
