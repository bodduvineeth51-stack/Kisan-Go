import { supabase } from './supabaseClient'

// Who is logged in, decided by the database (Phase 2 get_my_role):
//   { role: 'owner',  status: 'active',  business_id, business_name, name, vehicle_rates }
//   { role: 'driver', status: 'active' | 'revoked', … }
//   null → no business yet (owner sign-up form)
//
// claim_driver_invite runs first so a driver the owner just added lands on the
// driver screens on their very first login. It reads the verified phone on the
// server; nothing about the phone is sent from here.
export async function loadMyRole() {
  const claim = await supabase.rpc('claim_driver_invite')
  // Never turn a failed invitation claim into an accidental owner sign-up.
  if (claim.error) throw claim.error

  const { data, error } = await supabase.rpc('get_my_role')
  if (error) throw error
  return data?.[0] ?? null
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
    supabase.rpc(fn, args),
    checkStatus ? supabase.rpc('get_my_role') : Promise.resolve(null),
  ])
  if (isNotAllowed(res.error)) throw new AccessRemovedError()
  if (roleRes) {
    if (roleRes.error && isNotAllowed(roleRes.error)) throw new AccessRemovedError()
    if (roleRes.error) throw roleRes.error
    const me = roleRes.data?.[0]
    if (!roleRes.error && (!me || me.role !== 'driver' || me.status !== 'active')) {
      throw new AccessRemovedError()
    }
  }
  if (res.error) throw res.error
  return res.data
}
