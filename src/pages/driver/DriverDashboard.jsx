import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { driverRpc, AccessRemovedError } from '../../lib/roles'
import { formatHours } from '../../lib/format'
import { useTrans, LangToggle } from '../../context/LangContext'
import BottomNav from '../../components/BottomNav'
import { DateTile, EmptyCard, ErrorCard, Logo, Spinner } from '../../components/ui'
import { DRIVER_TABS } from './tabs'

// Driver Home, laid out like the owner Home (2-home.html) but with only the
// driver's own work: hours and jobs today, no money.
export default function DriverDashboard({ me, onAccessRemoved, activeTab, onTabChange }) {
  const { t, lang } = useTrans()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(false)
    driverRpc('my_work_records', undefined, { checkStatus: true }).then(rows => {
      if (active) setJobs(rows)
    }).catch(err => {
      if (!active) return
      if (err instanceof AccessRemovedError) onAccessRemoved()
      else setError(true)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt, onAccessRemoved])

  const today = new Date().toDateString()
  const todayJobs = jobs.filter(j => new Date(j.created_at).toDateString() === today)
  const hours = todayJobs.reduce((sum, j) => sum + Number(j.total_hours), 0)
  const dateLabel = new Date().toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
  const blank = loading || error

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pb-32 pt-4">
        <div className="flex h-11 items-center justify-between">
          <Logo />
          <LangToggle />
        </div>

        <div>
          <p className="text-sm font-medium text-muted">{dateLabel}</p>
          <h1 className="mt-0.5 break-words text-[26px] font-extrabold leading-[1.15] tracking-[-0.6px]">{t('namaste', { name: me.name })}</h1>
          <p className="mt-0.5 text-sm font-semibold text-muted">{t('driverForBusiness', { business: me.business_name ?? '' })}</p>
        </div>

        {/* Today's work */}
        <div className="flex flex-col gap-1 rounded-[24px] bg-primary p-5 text-white shadow-hero">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white/80">{t('hoursToday')}</span>
            <span className="text-[13px] font-semibold text-white/80">
              {blank ? '—' : t(todayJobs.length === 1 ? 'jobCount' : 'jobsCount', { n: todayJobs.length })}
            </span>
          </div>
          <div className="text-[40px] font-extrabold leading-tight tracking-[-1.2px]">{blank ? '—' : formatHours(hours)}</div>
        </div>

        {/* Start work */}
        <button
          onClick={() => onTabChange('customers')}
          aria-label={t('chooseCustomerStart')}
          className="flex h-[68px] shrink-0 items-center justify-center gap-3 rounded-[20px] bg-surface text-primary shadow-card active:scale-[0.98]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
            <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden="true" />
          </span>
          <span className="text-xl font-extrabold tracking-[-0.3px]">{t('startWork')}</span>
        </button>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold tracking-[-0.3px]">{t('recentJobs')}</h2>
            <button onClick={() => onTabChange('myjobs')} className="min-h-11 px-1 text-sm font-bold text-primary">{t('seeAll')}</button>
          </div>
          {error && <ErrorCard onRetry={() => setAttempt(n => n + 1)} />}
          {loading && <Spinner />}
          {!blank && jobs.length === 0 && <EmptyCard title={t('noMyJobs')} />}
          {!blank && jobs.length > 0 && (
            <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
              {jobs.slice(0, 5).map(job => (
                <div key={job.id} className="flex items-center gap-3 border-b border-divider px-3.5 py-2.5 last:border-b-0">
                  <DateTile iso={job.created_at} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold">{job.customer_name}</span>
                    <span className="block text-[13px] font-medium text-muted">{job.vehicle_type} · {formatHours(job.total_hours)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <BottomNav active={activeTab} onChange={onTabChange} tabs={DRIVER_TABS} />
    </div>
  )
}
