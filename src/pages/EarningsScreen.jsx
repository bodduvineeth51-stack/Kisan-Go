import { useState, useEffect, useMemo } from 'react'
import { MessageCircle, Tractor } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney, formatHours } from '../lib/format'
import { whatsappUrl } from '../lib/phone'
import { customerBalances, daysSince, periodStart } from '../lib/money'
import BottomNav from '../components/BottomNav'
import Avatar from '../components/Avatar'
import { PageHeader, Spinner, ErrorCard } from '../components/ui'
import { useTrans } from '../context/LangContext'

const PERIODS = [['today', 'periodToday'], ['week', 'periodWeek'], ['season', 'periodSeason']]

// Owner's Money tab (kisan-design/screens/7-money.html).
// "Collected" = bills of customers marked paid (is_paid is per customer).
export default function EarningsScreen({ owner, activeTab, onTabChange, onOpenCustomer }) {
  const { t } = useTrans()
  const [customers, setCustomers]     = useState([])
  const [workRecords, setWorkRecords] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [period, setPeriod]           = useState('season')

  async function fetchAll() {
    setLoading(true)
    setError('')
    const [cRes, rRes] = await Promise.all([
      supabase.from('customers').select('id, name, phone, is_paid'),
      supabase.from('work_records').select('id, customer_id, amount, total_hours, vehicle_type, created_at'),
    ])
    setLoading(false)
    if (cRes.error) { setError(cRes.error.message); return }
    if (rRes.error) { setError(rRes.error.message); return }
    setCustomers(cRes.data)
    setWorkRecords(rRes.data)
  }

  useEffect(() => { fetchAll() }, [])

  const { totals, jobs, owers, vehicles } = useMemo(() => {
    const paidIds = new Set(customers.filter((c) => c.is_paid).map((c) => c.id))
    const from = periodStart(period)
    const recs = from ? workRecords.filter((r) => new Date(r.created_at) >= from) : workRecords
    const earned = recs.reduce((s, r) => s + Number(r.amount), 0)
    const collected = recs.filter((r) => paidIds.has(r.customer_id)).reduce((s, r) => s + Number(r.amount), 0)

    const balances = customerBalances(customers, workRecords)
    const owers = customers
      .filter((c) => balances[c.id]?.due > 0)
      .map((c) => ({ customer: c, ...balances[c.id] }))
      .sort((a, b) => b.due - a.due)

    // Every current vehicle (idle ones too), then any older vehicle names
    // that still have work in this period.
    const byName = new Map(owner.vehicle_rates.map((v) => [v.type, { name: v.type, jobs: 0, hours: 0, amount: 0 }]))
    for (const r of recs) {
      const name = r.vehicle_type || '—'
      if (!byName.has(name)) byName.set(name, { name, jobs: 0, hours: 0, amount: 0 })
      const v = byName.get(name)
      v.jobs += 1
      v.hours += Number(r.total_hours) || 0
      v.amount += Number(r.amount) || 0
    }
    const vehicles = [...byName.values()].sort((a, b) => b.amount - a.amount)

    return { totals: { earned, collected, pending: earned - collected }, jobs: recs.length, owers, vehicles }
  }, [customers, workRecords, period, owner.vehicle_rates])

  const paidPct = totals.earned > 0 ? Math.round((totals.collected / totals.earned) * 100) : 0

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pb-32 pt-4">
        <PageHeader title={t('earningsTab')} chip={loading ? null : t(jobs === 1 ? 'jobCount' : 'jobsCount', { n: jobs })} />

        {/* Period tabs */}
        <div role="tablist" className="grid grid-cols-3 gap-1 rounded-[18px] bg-surface p-[5px] shadow-card">
          {PERIODS.map(([id, key]) => (
            <button
              key={id}
              role="tab"
              aria-selected={period === id}
              onClick={() => setPeriod(id)}
              className={`h-11 rounded-[14px] text-sm ${period === id ? 'bg-primary font-bold text-white' : 'font-semibold text-muted'}`}
            >
              {t(key)}
            </button>
          ))}
        </div>

        {error && <ErrorCard message={error} onRetry={fetchAll} />}

        {/* Total earned */}
        <div className="flex flex-col gap-3 rounded-[24px] bg-primary p-5 text-white shadow-hero">
          <div>
            <p className="text-sm font-semibold text-white/80">{t('totalEarned')}</p>
            <p className="text-[40px] font-extrabold leading-tight tracking-[-1.2px]">{loading ? '…' : formatMoney(totals.earned)}</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-lime" style={{ width: `${paidPct}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-white/[0.12] px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                <span className="h-2 w-2 rounded-full bg-lime" />{t('collectedLabel')}
              </p>
              <p className="text-xl font-extrabold">{formatMoney(totals.collected)}</p>
            </div>
            <div className="rounded-2xl bg-surface px-3 py-2.5 text-due">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <span className="h-2 w-2 rounded-full bg-due-bar" />{t('pendingLabel')}
              </p>
              <p className="text-xl font-extrabold">{formatMoney(totals.pending)}</p>
            </div>
          </div>
        </div>

        {/* By vehicle */}
        {!loading && !error && (
          <div className="flex flex-col gap-2">
            <h2 className="text-[17px] font-extrabold">{t('byVehicle')}</h2>
            <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
              {vehicles.map((v) => (
                <div key={v.name} className="flex items-center gap-3 border-b border-divider px-3.5 py-3 last:border-b-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-mint-100 text-primary">
                    <Tractor size={20} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{v.name}</span>
                    <span className="block text-xs font-medium text-muted">
                      {v.jobs ? `${t(v.jobs === 1 ? 'jobCount' : 'jobsCount', { n: v.jobs })} · ${formatHours(v.hours)}` : t('noVehicleWork')}
                    </span>
                  </span>
                  <span className={`text-[15px] font-extrabold ${v.jobs ? 'text-ink' : 'text-muted'}`}>{formatMoney(v.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Who owes the most */}
        <div className="flex flex-col gap-2">
          <h2 className="text-[17px] font-extrabold">{t('whoOwesMost')}</h2>
          {loading && <Spinner />}
          {!loading && !error && owers.length === 0 && (
            <p className="rounded-[18px] bg-surface px-4 py-6 text-center text-sm font-semibold text-muted shadow-card">{t('allPaidMsg')}</p>
          )}
          {!loading && owers.length > 0 && (
            <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
              {owers.map(({ customer, due, since }) => {
                const days = daysSince(since)
                const msg = t('reminderMessage', { name: customer.name, amount: formatMoney(due), owner: owner.name })
                return (
                  <div key={customer.id} className="flex items-center gap-2.5 border-b border-divider py-2 pl-3.5 pr-2 last:border-b-0">
                    <button onClick={() => onOpenCustomer(customer)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left text-ink">
                      <Avatar name={customer.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold">{customer.name}</span>
                        <span className="block text-xs font-medium text-muted">{t('waitingDays', { n: days })}</span>
                      </span>
                      <span className="text-[15px] font-extrabold text-due">{formatMoney(due)}</span>
                    </button>
                    <a
                      href={whatsappUrl(customer.phone, msg) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('remindOnWhatsApp', { name: customer.name })}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-mint-50 text-primary"
                    >
                      <MessageCircle size={20} strokeWidth={2.2} aria-hidden="true" />
                    </a>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}
