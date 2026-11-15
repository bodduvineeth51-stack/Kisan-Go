import { useCallback, useEffect, useState } from 'react'
import { driverRpc, AccessRemovedError } from '../../lib/roles'
import { formatHours } from '../../lib/format'
import BottomNav from '../../components/BottomNav'
import { DateTile, Spinner, ErrorCard, EmptyCard } from '../../components/ui'
import { useTrans } from '../../context/LangContext'
import DriverHeader from './DriverHeader'
import { DRIVER_TABS } from './tabs'

function fmtTime(iso, lang) {
  return new Date(iso).toLocaleTimeString(lang === 'te' ? 'te-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' })
}

// Only the jobs this driver submitted (my_work_records filters on
// created_by = auth.uid()). No paid status, no totals, and no money: the
// driver sees the amount once, on the screen right after Submit.
export default function MyJobs({ me, onAccessRemoved, activeTab, onTabChange }) {
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
        <DriverHeader me={me} title={t('myJobsTab')} chip={loading || error ? null : t(jobs.length === 1 ? 'jobCount' : 'jobsCount', { n: jobs.length })} />

        {error && <ErrorCard message={error} onRetry={fetchJobs} />}
        {loading && <Spinner />}
        {!loading && !error && jobs.length === 0 && <EmptyCard title={t('noMyJobs')} />}

        {!loading && jobs.length > 0 && (
          <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-3 border-b border-divider px-3.5 py-2.5 last:border-b-0">
                <DateTile iso={j.created_at} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold text-ink">{j.customer_name}</p>
                  <p className="text-[13px] font-medium text-muted">{j.vehicle_type} · {formatHours(j.total_hours)}</p>
                </div>
                <span className="text-right text-[13px] font-semibold text-muted">{fmtTime(j.created_at, lang)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav active={activeTab} onChange={onTabChange} tabs={DRIVER_TABS} />
    </div>
  )
}
