import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { driverRpc, AccessRemovedError } from '../../lib/roles'
import { formatHours } from '../../lib/format'
import { useTrans, LangToggle } from '../../context/LangContext'
import BottomNav from '../../components/BottomNav'
import { Bilingual, DateTile, EmptyCard, ErrorCard, Logo, Spinner } from '../../components/ui'
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
          <h1 className="mt-0.5 break-words text-[28px] font-extrabold leading-[1.15] tracking-[-0.8px]">{t('namaste', { name: me.name })}</h1>
          <p className="mt-0.5 text-sm font-semibold text-muted">{t('driverForBusiness', { business: me.business_name ?? '' })}</p>
        </div>

        {/* Today's work */}
        <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-[26px] bg-primary p-5 text-white shadow-hero">
          <div className="absolute -right-10 -top-[50px] h-[170px] w-[170px] rounded-full bg-circle-1 opacity-45" />
          <div className="absolute right-10 top-[60px] h-20 w-20 rounded-full bg-circle-2 opacity-30" />
          <div className="relative flex items-center gap-2">
            <span className="text-sm font-semibold text-mint-100">{t('hoursToday')}</span>
            <span className="ml-auto rounded-xl bg-white/[0.18] px-2.5 py-1 text-[13px] font-bold">
              {blank ? '—' : t(todayJobs.length === 1 ? 'jobCount' : 'jobsCount', { n: todayJobs.length })}
            </span>
          </div>
          <div className="relative text-[44px] font-extrabold leading-none tracking-[-1.5px]">{blank ? '—' : formatHours(hours)}</div>
          <p className="relative text-sm font-medium text-mint-100">{t('driverDashboardHelp')}</p>
        </div>

        {/* Start work */}
        <button
          onClick={() => onTabChange('customers')}
          aria-label={t('chooseCustomerStart')}
          className="flex h-20 shrink-0 items-center gap-4 rounded-3xl bg-primary-bright px-[18px] text-left text-white shadow-start active:scale-[0.98]"
        >
          <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-surface shadow-[0_0_0_6px_rgba(255,255,255,0.25)]">
            <Play size={24} fill="#15803D" strokeWidth={0} aria-hidden="true" />
          </span>
          <span className="flex-1 text-[22px] font-extrabold tracking-[-0.5px]">
            <Bilingual k="startWork" subClass="text-sm font-medium tracking-normal text-mint-100" />
          </span>
        </button>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold tracking-[-0.3px]">{t('recentJobs')}</h2>
            <button onClick={() => onTabChange('myjobs')} className="min-h-11 px-1 text-sm font-bold text-primary">{t('seeAll')}</button>
          </div>
          {error && <ErrorCard onRetry={() => setAttempt(n => n + 1)} />}
          {loading && <Spinner />}
          {!blank && jobs.length === 0 && <EmptyCard title={t('noMyJobs')} />}
          {!blank && jobs.slice(0, 5).map(job => (
            <div key={job.id} className="flex items-center gap-3 rounded-[18px] bg-surface px-3.5 py-2.5 shadow-card">
              <DateTile iso={job.created_at} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold">{job.customer_name}</span>
                <span className="block text-[13px] font-medium text-muted">{job.vehicle_type} · {formatHours(job.total_hours)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <BottomNav active={activeTab} onChange={onTabChange} tabs={DRIVER_TABS} />
    </div>
  )
}
