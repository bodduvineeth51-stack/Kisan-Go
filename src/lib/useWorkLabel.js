import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

// Owner screens: who did a job, as "Harvester 1 · Ravi". The driver name
// comes from work_records.created_by and this business's driver
// memberships (policy memberships_owner_read). Jobs the owner recorded
// show only the vehicle — no extra text.
export function useWorkLabel(ownerId) {
  const [names, setNames] = useState({})

  useEffect(() => {
    let cancelled = false
    supabase
      .from('memberships')
      .select('user_id, name')
      .eq('business_id', ownerId)
      .eq('role', 'driver')
      .not('user_id', 'is', null)
      .then(({ data, error }) => {
        if (cancelled) return
        // Without names the screens still work; they just show the vehicle.
        if (error) { console.error('[workLabel]', error); return }
        setNames(Object.fromEntries(data.map((m) => [m.user_id, m.name])))
      })
    return () => { cancelled = true }
  }, [ownerId])

  const driverOf = useCallback((record) => {
    if (!record.created_by || record.created_by === ownerId) return null
    return names[record.created_by] ?? null
  }, [names, ownerId])

  const workLabel = useCallback((record) => {
    const driver = driverOf(record)
    return [record.vehicle_type, driver].filter(Boolean).join(' · ')
  }, [driverOf])

  return { driverOf, workLabel }
}
