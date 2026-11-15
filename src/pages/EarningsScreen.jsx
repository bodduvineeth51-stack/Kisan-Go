import { useState, useEffect, useMemo } from 'react'
import { MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney } from '../lib/format'
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
      supabase.from('work_records').select('id, customer_id, amount, created_at'),
    ])
    setLoading(false)
    if (cRes.error) { setError(cRes.error.message); return }
    if (rRes.error) { setError(rRes.error.message); return }
    setCustomers(cRes.data)
    setWorkRecords(rRes.data)
  }

  useEffect(() => { fetchAll() }, [])

  const { totals, jobs, owers } = useMemo(() => {
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

    return { totals: { earned, collected, pending: earned - collected }, jobs: recs.length, owers }
  }, [customers, workRecords, period])

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
              className={`h-11 rounded-[14px] text-sm ${period === id ? 'bg-primary font-extrabold text-white' : 'font-semibold text-muted'}`}
            >
              {t(key)}
            </button>
          ))}
        </div>

        {error && <ErrorCard message={error} onRetry={fetchAll} />}

        {/* Total earned */}
        <div className="relative flex flex-col gap-3.5 overflow-hidden rounded-[26px] bg-primary p-5 text-white shadow-hero">
          <div className="absolute -right-[50px] -top-[60px] h-[180px] w-[180px] rounded-full bg-circle-1 opacity-45" />
          <div className="relative">
            <p className="text-sm font-semibold text-mint-100">{t('totalEarned')}</p>
            <p className="text-[42px] font-extrabold leading-[1.05] tracking-[-1.5px]">{loading ? '…' : formatMoney(totals.earned)}</p>
          </div>
          <div className="relative h-3 overflow-hidden rounded-md bg-due-bar">
            <div className="h-full rounded-md bg-lime" style={{ width: `${paidPct}%` }} />
          </div>
          <div className="relative grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-white/[0.14] px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-mint-100">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-lime" />{t('collectedLabel')}
              </p>
              <p className="text-xl font-extrabold">{formatMoney(totals.collected)}</p>
            </div>
            <div className="rounded-2xl bg-surface px-3 py-2.5 text-due">
              <p className="flex items-center gap-1.5 text-xs font-bold">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-due-bar" />{t('pendingLabel')}
              </p>
              <p className="text-xl font-extrabold">{formatMoney(totals.pending)}</p>
            </div>
          </div>
        </div>

        {/* Who owes the most */}
        <div className="flex flex-col gap-2">
          <h2 className="text-[17px] font-extrabold">{t('whoOwesMost')}</h2>
          {loading && <Spinner />}
          {!loading && !error && owers.length === 0 && (
            <p className="rounded-[18px] bg-surface px-4 py-6 text-center text-sm font-semibold text-muted shadow-card">{t('allPaidMsg')}</p>
          )}
          {!loading && owers.map(({ customer, due, since }) => {
            const days = daysSince(since)
            const msg = t('reminderMessage', { name: customer.name, amount: formatMoney(due), owner: owner.name })
            return (
              <div key={customer.id} className="flex items-center gap-2.5 rounded-[18px] bg-surface py-2 pl-3.5 pr-2 shadow-card">
                <button onClick={() => onOpenCustomer(customer)} className="flex min-w-0 flex-1 items-center gap-3 text-left text-ink">
                  <Avatar id={customer.id} name={customer.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{customer.name}</span>
                    <span className="block text-xs font-semibold text-muted">{t('waitingDays', { n: days })}</span>
                  </span>
                  <span className="text-[15px] font-extrabold text-due">{formatMoney(due)}</span>
                </button>
                <a
                  href={whatsappUrl(customer.phone, msg) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('remindOnWhatsApp', { name: customer.name })}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-mint-100 text-primary"
                >
                  <MessageCircle size={20} strokeWidth={2.2} aria-hidden="true" />
                </a>
              </div>
            )
          })}
        </div>
      </div>

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}
