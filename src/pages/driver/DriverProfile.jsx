import { useCallback, useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { driverRpc, AccessRemovedError } from '../../lib/roles'
import { formatPhone } from '../../lib/phone'
import BottomNav from '../../components/BottomNav'
import { useTrans, LangToggle } from '../../context/LangContext'
import { DRIVER_TABS } from './tabs'
import { initials as toInitials } from '../../lib/format'
import { PageHeader } from '../../components/ui'

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-divider py-3 last:border-b-0">
      <span className="text-sm font-medium text-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-base font-bold text-ink">{value}</span>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="rounded-[22px] bg-surface px-5 pb-1 pt-4 shadow-card">
      <h2 className="text-lg font-extrabold text-ink">{title}</h2>
      {children}
    </div>
  )
}

// The driver's own details. Everything here is something the driver can
// already see elsewhere: their name (as the owner entered it), their login
// number, the business they drive for, the vehicles and rates from
// get_my_role, and their own jobs from my_work_records. Deliberately no money
// totals and no paid status.
export default function DriverProfile({ me, phone, onSignOut, onAccessRemoved, activeTab, onTabChange }) {
  const { t, lang } = useTrans()
  const [jobs, setJobs] = useState(undefined) // undefined = loading, null = failed

  const fetchJobs = useCallback(async () => {
    setJobs(undefined)
    try {
      setJobs(await driverRpc('my_work_records', undefined, { checkStatus: true }))
    } catch (err) {
      if (err instanceof AccessRemovedError) { onAccessRemoved(); return }
      setJobs(null)
    }
  }, [onAccessRemoved])

  useEffect(() => { fetchJobs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const vehicles = me.vehicle_rates ?? []
  const initials = toInitials(me.name)
  const lastJob = jobs?.[0]?.created_at // my_work_records is newest first
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  const pending = jobs === undefined ? '…' : '—'

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pb-32 pt-4">
        <PageHeader title={t('profileTab')} right={<LangToggle />} />

        {/* Who you are */}
        <div className="relative flex items-center gap-4 overflow-hidden rounded-[26px] bg-primary p-5 text-white shadow-hero">
          <div className="absolute -right-10 -top-[50px] h-[170px] w-[170px] rounded-full bg-circle-1 opacity-45" />
          <div className="absolute right-10 top-[60px] h-20 w-20 rounded-full bg-circle-2 opacity-30" />
          <span className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-mint-100 text-2xl font-extrabold text-primary">
            {initials}
          </span>
          <div className="relative min-w-0 flex-1">
            <p className="truncate text-2xl font-extrabold leading-tight tracking-[-0.5px]">{me.name}</p>
            <p className="mt-0.5 text-sm font-semibold text-mint-100">{formatPhone(phone)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-lg bg-white/[0.18] px-2 py-px text-xs font-bold">{t('roleDriver')}</span>
              <span className="rounded-lg bg-lime px-2 py-px text-xs font-bold text-ink">{t('status_active')}</span>
            </div>
          </div>
        </div>

        <Card title={t('profileWork')}>
          <Row label={t('profileOwner')} value={me.business_name ?? '—'} />
          <Row label={t('profileJobsRecorded')} value={jobs ? jobs.length : pending} />
          <Row label={t('profileLastJob')} value={jobs ? (lastJob ? fmtDate(lastJob) : t('profileNoJobs')) : pending} />
          {jobs === null && (
            <button onClick={fetchJobs} className="min-h-11 w-full text-sm font-bold text-primary underline">
              {t('retry')}
            </button>
          )}
        </Card>

        <Card title={t('profileVehicles')}>
          {vehicles.length === 0 && <p className="py-3 text-sm font-semibold text-due">{t('noVehicles')}</p>}
          {vehicles.map((v) => (
            <Row key={v.type} label={v.type} value={`₹${Number(v.hourly_rate).toLocaleString('en-IN')}/${t('hrShort')}`} />
          ))}
        </Card>

        <p className="px-1 text-sm font-medium text-muted">{t('profileContactOwner')}</p>

        <button
          onClick={onSignOut}
          className="flex min-h-14 items-center justify-center gap-2 rounded-[18px] bg-surface text-base font-extrabold text-danger shadow-card active:scale-[0.98]"
        >
          <LogOut size={20} strokeWidth={2.4} aria-hidden="true" />
          {t('signOut')}
        </button>
      </div>

      <BottomNav active={activeTab} onChange={onTabChange} tabs={DRIVER_TABS} />
    </div>
  )
}
