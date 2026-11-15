import { useState, useEffect, useMemo } from 'react'
import { ChevronRight, Tractor } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney, formatHours } from '../lib/format'
import BottomNav from '../components/BottomNav'
import AddButton from '../components/AddButton'
import Avatar from '../components/Avatar'
import CustomerForm from '../components/CustomerForm'
import { Logo, Spinner, ErrorCard, EmptyCard } from '../components/ui'
import { useTrans, LangToggle } from '../context/LangContext'
import { useWorkLabel } from '../lib/useWorkLabel'

// Only the states that need the owner's attention get a label; a bill that
// went out normally needs no extra text.
function StatusChip({ record, customer }) {
  const { t } = useTrans()
  const base = 'mt-0.5 inline-block rounded-md px-1.5 text-[11px] font-bold'
  if (customer?.is_paid) return <span className={`${base} bg-mint-100 text-primary`}>{t('paid')}</span>
  if (record.whatsapp_status === 'sent' || record.whatsapp_status === 'sending') return null
  return <span className={`${base} bg-due-bg text-due`}>{t('billNotSent')}</span>
}

export default function Home({ owner, activeTab, onTabChange, onOpenCustomer }) {
  const { t, lang } = useTrans()
  const [customers, setCustomers]     = useState([])
  const [workRecords, setWorkRecords] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [showForm, setShowForm]       = useState(false)
  const { driverOf } = useWorkLabel(owner.id)

  async function fetchAll() {
    setLoading(true)
    setError('')
    const [cRes, rRes] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('work_records').select('*').order('created_at', { ascending: false }),
    ])
    setLoading(false)
    if (cRes.error) { setError(cRes.error.message); return }
    if (rRes.error) { setError(rRes.error.message); return }
    setCustomers(cRes.data)
    setWorkRecords(rRes.data)
  }

  useEffect(() => { fetchAll() }, [])

  const { customerMap, todayRecs, todayAmount, todayHours, pendingTotal, pendingCount } = useMemo(() => {
    const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]))

    // Local-time midnight boundaries (same rule as EarningsScreen)
    const now      = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayEnd   = new Date(dayStart.getTime() + 86_400_000)
    const todayRecs = workRecords.filter((r) => {
      const d = new Date(r.created_at)
      return d >= dayStart && d < dayEnd
    })

    const pendingMap = {}
    for (const r of workRecords) {
      const c = customerMap[r.customer_id]
      if (!c || c.is_paid) continue
      pendingMap[c.id] = (pendingMap[c.id] ?? 0) + Number(r.amount)
    }
    const pendingAmounts = Object.values(pendingMap).filter((v) => v > 0)

    return {
      customerMap,
      todayRecs,
      todayAmount:  todayRecs.reduce((s, r) => s + Number(r.amount), 0),
      todayHours:   todayRecs.reduce((s, r) => s + Number(r.total_hours), 0),
      pendingTotal: pendingAmounts.reduce((s, v) => s + v, 0),
      pendingCount: pendingAmounts.length,
    }
  }, [customers, workRecords])

  const dateLabel = new Date().toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  // Today's jobs grouped by vehicle, busiest-most-recent vehicle first, so
  // an owner with two harvesters sees what each one did.
  const byVehicle = []
  for (const r of todayRecs) {
    let group = byVehicle.find((g) => g.vehicle === r.vehicle_type)
    if (!group) byVehicle.push(group = { vehicle: r.vehicle_type, jobs: [], hours: 0, amount: 0 })
    group.jobs.push(r)
    group.hours += Number(r.total_hours)
    group.amount += Number(r.amount)
  }

  const jobsLabel = t(todayRecs.length === 1 ? 'jobCount' : 'jobsCount', { n: todayRecs.length })

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pb-44 pt-4">
        {/* Top bar */}
        <div className="flex h-11 items-center justify-between">
          <Logo />
          <LangToggle />
        </div>

        {/* Greeting */}
        <div>
          <div className="text-sm font-medium text-muted">{dateLabel}</div>
          <h1 className="mt-0.5 text-[26px] font-extrabold leading-[1.15] tracking-[-0.6px]">
            {t('namaste', { name: owner.name })}
          </h1>
        </div>

        {error && <ErrorCard message={error} onRetry={fetchAll} />}

        {/* Today's earnings */}
        <div className="flex flex-col gap-1 rounded-[24px] bg-primary p-5 text-white shadow-hero">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white/80">{t('todaysEarnings')}</span>
            <span className="text-[13px] font-semibold text-white/80">{formatHours(todayHours)} · {jobsLabel}</span>
          </div>
          <div className="text-[40px] font-extrabold leading-tight tracking-[-1.2px]">
            {loading ? '…' : formatMoney(todayAmount)}
          </div>
          {pendingCount > 0 && (
            <button
              onClick={() => onTabChange('earnings')}
              className="mt-2 flex min-h-11 items-center gap-2 rounded-2xl bg-white/[0.14] px-3.5 py-2 text-left"
            >
              <span className="flex-1 text-sm font-semibold">
                <b className="font-extrabold">{formatMoney(pendingTotal)}</b>{' '}
                <span className="text-white/85">{t('toCollectFrom', { n: pendingCount })}</span>
              </span>
              <ChevronRight size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Today's jobs */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold tracking-[-0.3px]">{t('todaysJobs')}</h2>
            <button onClick={() => onTabChange('customers')} className="min-h-11 px-1 text-sm font-bold text-primary">
              {t('seeAll')}
            </button>
          </div>

          {loading && <Spinner />}

          {!loading && !error && todayRecs.length === 0 && (
            <EmptyCard title={t('noJobsToday')} sub={t('noJobsTodaySub')} />
          )}

          {!loading && byVehicle.map((g) => (
            <div key={g.vehicle} className="overflow-hidden rounded-[20px] bg-surface shadow-card">
              <div className="flex items-center gap-2 border-b border-divider bg-mint-50 px-3.5 py-2.5">
                <Tractor size={18} strokeWidth={2.2} className="shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{g.vehicle}</span>
                <span className="text-[13px] font-semibold text-muted">{formatHours(g.hours)} · {formatMoney(g.amount)}</span>
              </div>
              {g.jobs.map((r) => {
                const c = customerMap[r.customer_id]
                return (
                  <button
                    key={r.id}
                    onClick={() => c && onOpenCustomer(c)}
                    className="flex w-full items-center gap-3 border-b border-divider px-3.5 py-3 text-left text-ink last:border-b-0 active:bg-mint-50"
                  >
                    <Avatar name={c?.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold">{c?.name ?? '—'}</span>
                      <span className="block truncate text-[13px] font-medium text-muted">
                        {[formatHours(r.total_hours), driverOf(r)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="text-base font-extrabold">{formatMoney(r.amount)}</span>
                      <StatusChip record={r} customer={c} />
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <AddButton onClick={() => setShowForm(true)} ariaLabel={t('tileAddCustomer')} />

      {showForm && (
        <CustomerForm
          editing={null}
          ownerId={owner.id}
          onClose={() => setShowForm(false)}
          onSaved={(saved) => {
            setShowForm(false)
            onOpenCustomer(saved)
          }}
        />
      )}

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}
