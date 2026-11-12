import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useTrans } from '../context/LangContext'

// Owner screens: "Recorded by <driver name>" / "Recorded by You" for a work
// record, from work_records.created_by and the business's memberships
// (Phase 2 policy memberships_owner_read lets the owner read their own).
export function useRecordedBy(ownerId) {
  const { t } = useTrans()
  const [names, setNames] = useState({})

  useEffect(() => {
    let cancelled = false
    supabase
      .from('memberships')
      .select('user_id, name')
      .eq('role', 'driver')
      .not('user_id', 'is', null)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('[recordedBy]', error); return }
        setNames(Object.fromEntries(data.map((m) => [m.user_id, m.name])))
      })
    return () => { cancelled = true }
  }, [ownerId])

  return useCallback((record) => {
    // Records from before Phase 2 were backfilled with created_by = owner.
    if (!record.created_by || record.created_by === ownerId) return t('recordedBy', { name: t('you') })
    const name = names[record.created_by]
    return name ? t('recordedBy', { name }) : null
  }, [names, ownerId, t])
}
