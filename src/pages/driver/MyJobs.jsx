import { useCallback, useEffect, useState } from 'react'
import { driverRpc, AccessRemovedError } from '../../lib/roles'
import { formatHours } from '../../lib/format'
import BottomNav from '../../components/BottomNav'
import Avatar from '../../components/Avatar'
import { useTrans } from '../../context/LangContext'
import DriverHeader from './DriverHeader'
import { DRIVER_TABS } from './tabs'

function fmtDate(iso, lang) {
  return new Date(iso).toLocaleString(lang === 'te' ? 'te-IN' : 'en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

// Only the jobs this driver submitted (my_work_records filters on
// created_by = auth.uid()). No paid status, no totals, and no money: the
// driver sees the amount once, on the screen right after Submit.
export default function MyJobs({ me, onSignOut, onAccessRemoved, activeTab, onTabChange }) {
  const { t, lang } = useTrans()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setJobs(await driverRpc('my_work_records', undefined, { checkStatus: true }))
    } catch (err) {
      if (err instanceof AccessRemovedError) { onAccessRemoved(); return }
      setError(err?.message || t('somethingWrong'))
    } finally {
      setLoading(false)
    }
  }, [onAccessRemoved, t])

  useEffect(() => { fetchJobs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pb-32 pt-4">
        <DriverHeader me={me} title={t('myJobsTab')} onSignOut={onSignOut} />

        {error && (
          <div className="rounded-[18px] bg-surface px-4 py-3 text-center shadow-card">
            <p className="text-sm font-semibold text-danger">{error}</p>
            <button onClick={fetchJobs} className="mt-2 min-h-11 text-sm font-bold text-primary underline">
              {t('retry')}
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-mint-200 border-t-primary" />
          </div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-semibold text-muted shadow-card">
            {t('noMyJobs')}
          </div>
        )}

        {!loading && jobs.map((j) => (
          <div key={j.id} className="flex items-center gap-3 rounded-[18px] bg-surface px-3.5 py-2.5 shadow-card">
            <Avatar id={j.customer_id} name={j.customer_name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-ink">{j.customer_name}</p>
              <p className="text-[13px] font-medium text-muted">
                {j.vehicle_type} · {formatHours(j.total_hours)}
              </p>
            </div>
            <span className="text-right text-[13px] font-semibold text-muted">{fmtDate(j.created_at, lang)}</span>
          </div>
        ))}
      </div>

      <BottomNav active={activeTab} onChange={onTabChange} tabs={DRIVER_TABS} />
    </div>
  )
}
