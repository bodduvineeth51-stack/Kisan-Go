import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useTrans } from '../context/LangContext'

// Owner screens: who did a job, as "Harvester 1 · Ravi". The driver name
// comes from work_records.created_by and this business's driver
// memberships (policy memberships_owner_read). Jobs the owner recorded
// themselves say "You".
export function useWorkLabel(ownerId) {
  const { t } = useTrans()
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
    // Records from before drivers existed were backfilled with created_by = owner.
    if (!record.created_by || record.created_by === ownerId) return t('you')
    return names[record.created_by] ?? null
  }, [names, ownerId, t])

  const workLabel = useCallback((record) => {
    const driver = driverOf(record)
    return [record.vehicle_type, driver].filter(Boolean).join(' · ')
  }, [driverOf])

  return { driverOf, workLabel }
}
