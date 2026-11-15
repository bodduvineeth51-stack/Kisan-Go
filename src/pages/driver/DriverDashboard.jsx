import { useEffect, useState } from 'react'
import { ArrowRight, ClipboardList, Clock, Play } from 'lucide-react'
import { driverRpc, AccessRemovedError } from '../../lib/roles'
import { formatHours } from '../../lib/format'
import { useTrans } from '../../context/LangContext'
import BottomNav from '../../components/BottomNav'
import Avatar from '../../components/Avatar'
import DriverHeader from './DriverHeader'
import { DRIVER_TABS } from './tabs'

export default function DriverDashboard({ me, onSignOut, onAccessRemoved, activeTab, onTabChange }) {
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

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pb-32 pt-4">
        <DriverHeader me={me} title={t('homeTab')} onSignOut={onSignOut} />
        <section className="relative overflow-hidden rounded-[26px] bg-primary p-5 text-white shadow-green">
          <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-circle-1 opacity-40" />
          <p className="relative text-sm font-semibold text-mint-100">{t('driverDashboard')}</p>
          <h1 className="relative mt-2 break-words text-[28px] font-extrabold leading-tight">{t('namaste', { name: me.name })}</h1>
          <p className="relative mt-2 text-sm text-mint-100">{t('driverDashboardHelp')}</p>
          <div className="relative mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/15 p-3"><ClipboardList size={20} /><p className="mt-2 text-2xl font-extrabold">{loading || error ? '—' : todayJobs.length}</p><p className="text-sm text-mint-100">{t('todaysJobs')}</p></div>
            <div className="rounded-2xl bg-white/15 p-3"><Clock size={20} /><p className="mt-2 text-2xl font-extrabold">{loading || error ? '—' : formatHours(hours)}</p><p className="text-sm text-mint-100">{t('hoursToday')}</p></div>
          </div>
        </section>
        <button onClick={() => onTabChange('customers')} className="flex min-h-16 items-center justify-center gap-3 rounded-[20px] bg-primary-bright text-lg font-extrabold text-white shadow-green">
          <Play size={22} />{t('chooseCustomerStart')}
        </button>
        <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">{t('recentJobs')}</h2><button onClick={() => onTabChange('myjobs')} className="min-h-11 px-2 text-sm font-bold text-primary">{t('seeAll')}</button></div>
        {error && <div role="alert" className="rounded-2xl bg-surface p-4 text-center shadow-card"><p className="text-danger">{t('somethingWrong')}</p><button onClick={() => setAttempt(n => n + 1)} className="min-h-11 font-bold text-primary">{t('retry')}</button></div>}
        {loading && <p role="status" className="py-5 text-center text-muted">{t('loading')}</p>}
        {!loading && !error && jobs.length === 0 && <p className="rounded-[18px] bg-surface p-5 text-center text-sm font-semibold text-muted shadow-card">{t('noMyJobs')}</p>}
        {!loading && !error && jobs.slice(0, 5).map(job => <div key={job.id} className="flex items-center gap-3 rounded-[18px] bg-surface p-4 shadow-card">
          <Avatar id={job.customer_id} name={job.customer_name} />
          <div className="min-w-0 flex-1"><p className="truncate font-bold">{job.customer_name}</p><p className="text-sm text-muted">{job.vehicle_type} · {formatHours(job.total_hours)}</p><p className="mt-1 text-xs text-muted">{new Date(job.created_at).toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-IN')}</p></div>
        </div>)}
        <button onClick={() => onTabChange('profile')} className="flex min-h-14 items-center justify-between rounded-2xl bg-mint-100 px-4 font-bold text-primary">{t('profileVehicles')}<ArrowRight size={20} /></button>
      </div>
      <BottomNav active={activeTab} onChange={onTabChange} tabs={DRIVER_TABS} />
    </div>
  )
}
