import { useState, useEffect, useMemo } from 'react'
import { MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney } from '../lib/format'
import { moneyByCustomer, reminderLink, daysSince } from '../lib/bills'
import BottomNav from '../components/BottomNav'
import Avatar from '../components/Avatar'
import { useTrans } from '../context/LangContext'

// Indian crop season for the header chip.
function seasonName(d = new Date()) {
  const m = d.getMonth() // 0 = Jan
  const y = d.getFullYear()
  if (m >= 5 && m <= 9) return `Kharif ${y}`
  if (m >= 10) return `Rabi ${y}-${String(y + 1).slice(2)}`
  if (m <= 2) return `Rabi ${y - 1}-${String(y).slice(2)}`
  return `Zaid ${y}`
}

// Start of the period in local time. 'season' = everything on record:
// owners delete customers at season end, which removes their records.
function periodStart(period) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'today') return today
  if (period === 'week') {
    const sinceMonday = (today.getDay() + 6) % 7
    return new Date(today.getTime() - sinceMonday * 86_400_000)
  }
  return null
}

export default function EarningsScreen({ activeTab, onTabChange, onOpenCustomer }) {
  const { t, lang } = useTrans()
  const [customers, setCustomers] = useState([])
  const [records, setRecords]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [period, setPeriod]       = useState('season') // 'today' | 'week' | 'season'

  async function fetchAll() {
    setLoading(true)
    setError('')
    const [cRes, rRes] = await Promise.all([
      supabase.from('customers').select('*'),
      supabase.from('work_records').select('id, customer_id, amount, created_at'),
    ])
    setLoading(false)
    if (cRes.error) { setError(cRes.error.message); return }
    if (rRes.error) { setError(rRes.error.message); return }
    setCustomers(cRes.data)
    setRecords(rRes.data)
  }

  useEffect(() => { fetchAll() }, [])

  const { earned, collected, owers } = useMemo(() => {
    const paidIds = new Set(customers.filter((c) => c.is_paid).map((c) => c.id))
    const from = periodStart(period)
    const inPeriod = from ? records.filter((r) => new Date(r.created_at) >= from) : records
    const earned = inPeriod.reduce((s, r) => s + Number(r.amount), 0)
    // "Collected" = bills of customers marked paid (is_paid is per customer)
    const collected = inPeriod
      .filter((r) => paidIds.has(r.customer_id))
      .reduce((s, r) => s + Number(r.amount), 0)

    const money = moneyByCustomer(customers, records)
    const owers = customers
      .filter((c) => money[c.id].owed > 0)
      .map((c) => ({ customer: c, ...money[c.id] }))
      .sort((a, b) => b.owed - a.owed)
    return { earned, collected, owers }
  }, [customers, records, period])

  const pending = earned - collected
  const paidPct = earned > 0 ? Math.round((collected / earned) * 100) : 0

  const tabs = [['today', t('todaySection')], ['week', t('thisWeek')], ['season', t('seasonTab')]]

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pb-32 pt-4">
        <div className="flex h-11 items-center justify-between">
          <h1 className="text-[28px] font-extrabold tracking-[-0.8px]">{t('earningsTab')}</h1>
          <span className="rounded-xl bg-mint-100 px-3 py-[5px] text-[13px] font-extrabold text-primary">
            {seasonName()}
          </span>
        </div>

        {/* Period tabs */}
        <div className="grid grid-cols-3 gap-1 rounded-[18px] bg-surface p-[5px] shadow-card">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPeriod(id)}
              aria-pressed={period === id}
              className={`h-11 rounded-[14px] text-sm ${
                period === id ? 'bg-primary font-extrabold text-white' : 'font-semibold text-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-[18px] bg-surface px-4 py-3 text-center shadow-card">
            <p className="text-sm font-semibold text-danger">{error}</p>
            <button onClick={fetchAll} className="mt-2 min-h-11 text-sm font-bold text-primary underline">
              {t('retry')}
            </button>
          </div>
        )}

        {/* Earned hero card */}
        <div className="relative flex flex-col gap-3.5 overflow-hidden rounded-[26px] bg-primary p-5 text-white shadow-[0_10px_24px_rgba(21,128,61,0.28)]">
          <div className="absolute -right-[50px] -top-[60px] h-[180px] w-[180px] rounded-full bg-circle-1 opacity-45" />
          <div className="relative">
            <div className="text-sm font-semibold text-mint-100">{t('totalEarned')}</div>
            <div className="text-[42px] font-extrabold leading-[1.05] tracking-[-1.5px]">
              {loading ? '…' : formatMoney(earned)}
            </div>
          </div>
          <div
            className="relative h-3 overflow-hidden rounded-md bg-due-bar"
            role="img"
            aria-label={t('collectedPct', { n: paidPct })}
          >
            <div className="h-full rounded-md bg-lime" style={{ width: `${paidPct}%` }} />
          </div>
          <div className="relative grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-white/[0.14] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-mint-100">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-lime" />{t('collectedLabel')}
              </div>
              <div className="text-xl font-extrabold">{formatMoney(collected)}</div>
            </div>
            <div className="rounded-2xl bg-surface px-3 py-2.5 text-due">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-due-bar" />{t('toCollect')}
              </div>
              <div className="text-xl font-extrabold">{formatMoney(pending)}</div>
            </div>
          </div>
        </div>

        {/* Who owes the most (all time) */}
        <div className="flex flex-col gap-2">
          <h2 className="text-[17px] font-extrabold">{t('whoOwesMost')}</h2>

          {loading && (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-mint-200 border-t-primary" />
            </div>
          )}

          {!loading && !error && owers.length === 0 && (
            <div className="rounded-[18px] bg-surface px-4 py-6 text-center text-sm font-semibold text-primary shadow-card">
              {t('allPaidMsg')}
            </div>
          )}

          {!loading && owers.map(({ customer: c, owed, since }) => (
            <div key={c.id} className="flex items-center gap-2.5 rounded-[18px] bg-surface py-2 pl-3.5 pr-2 shadow-card">
              <button onClick={() => onOpenCustomer(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar id={c.id} name={c.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{c.name}</span>
                  <span className="block text-xs font-semibold text-muted">
                    {t('waitingDays', { n: daysSince(since) })}
                  </span>
                </span>
                <span className="text-[15px] font-extrabold text-due">{formatMoney(owed)}</span>
              </button>
              <a
                href={reminderLink(c, owed, lang)}
                target="_blank"
                rel="noreferrer"
                aria-label={t('remindOnWhatsapp', { name: c.name })}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-mint-100 text-primary"
              >
                <MessageCircle size={20} strokeWidth={2.2} aria-hidden="true" />
              </a>
            </div>
          ))}
        </div>
      </div>

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}
