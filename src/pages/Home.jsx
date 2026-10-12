import { useState, useEffect, useMemo } from 'react'
import { Clock, ChevronRight, UserPlus, Wallet, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney, formatHours } from '../lib/format'
import BottomNav from '../components/BottomNav'
import AddButton from '../components/AddButton'
import Avatar from '../components/Avatar'
import { CustomerForm } from './Dashboard'
import { useTrans } from '../context/LangContext'

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="38" height="38" viewBox="0 0 36 36" aria-hidden="true">
        <rect width="36" height="36" rx="11" fill="#15803D" />
        <circle cx="18" cy="21" r="8" fill="none" stroke="#BEF264" strokeWidth="3" />
        <circle cx="18" cy="21" r="2.5" fill="#BEF264" />
        <path d="M18 13c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z" fill="#FFFFFF" />
      </svg>
      <span className="text-[22px] font-extrabold tracking-[-0.5px] text-ink">
        Kisan<span className="text-primary-bright">Go</span>
      </span>
    </div>
  )
}

function LangButton() {
  const { t, lang, setLang } = useTrans()
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'te' : 'en')}
      aria-label={t('changeLanguage')}
      className="h-11 rounded-[22px] bg-surface px-4 text-sm font-bold text-primary shadow-[0_2px_10px_rgba(15,42,26,0.08)]"
    >
      తె | EN
    </button>
  )
}

function Tile({ icon: Icon, iconClass, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex h-[92px] flex-col items-center justify-center gap-2 rounded-[20px] bg-surface text-[13px] font-bold text-ink shadow-card active:scale-[0.97]"
    >
      <span className={`flex h-[42px] w-[42px] items-center justify-center rounded-[14px] ${iconClass}`}>
        <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
      </span>
      {label}
    </button>
  )
}

function StatusChip({ record, customer }) {
  const { t } = useTrans()
  const base = 'inline-block rounded-lg px-2 py-px text-xs font-bold'
  if (customer?.is_paid) return <span className={`${base} bg-primary text-white`}>{t('paid')}</span>
  if (record.whatsapp_status === 'sent') return <span className={`${base} bg-mint-100 text-primary`}>{t('billSent')}</span>
  if (record.whatsapp_status === 'sending') return <span className={`${base} bg-mint-50 text-muted`}>{t('whatsappSending')}</span>
  return <span className={`${base} bg-due-bg text-due`}>{t('billNotSent')}</span>
}

export default function Home({ owner, activeTab, onTabChange }) {
  const { t, lang } = useTrans()
  const [customers, setCustomers]     = useState([])
  const [workRecords, setWorkRecords] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [showForm, setShowForm]       = useState(false)

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
  const jobsLabel = t(todayRecs.length === 1 ? 'jobCount' : 'jobsCount', { n: todayRecs.length })

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pb-44 pt-4">
        {/* Top bar */}
        <div className="flex h-11 items-center justify-between">
          <Logo />
          <LangButton />
        </div>

        {/* Greeting */}
        <div>
          <div className="text-sm font-medium text-muted">{dateLabel}</div>
          <h1 className="mt-0.5 text-[28px] font-extrabold leading-[1.15] tracking-[-0.8px]">
            {t('namaste', { name: owner.name })}
          </h1>
        </div>

        {error && (
          <div className="rounded-[18px] bg-surface px-4 py-3 text-center shadow-card">
            <p className="text-sm font-semibold text-danger">{error}</p>
            <button onClick={fetchAll} className="mt-2 min-h-11 text-sm font-bold text-primary underline">
              {t('retry')}
            </button>
          </div>
        )}

        {/* Today's earnings hero card */}
        <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-[26px] bg-primary p-5 text-white shadow-[0_10px_24px_rgba(21,128,61,0.28)]">
          <div className="absolute -right-10 -top-[50px] h-[170px] w-[170px] rounded-full bg-circle-1 opacity-45" />
          <div className="absolute right-10 top-[60px] h-20 w-20 rounded-full bg-circle-2 opacity-30" />
          <div className="relative flex items-center gap-2">
            <span className="text-sm font-semibold text-mint-100">{t('todaysEarnings')}</span>
            <span className="ml-auto rounded-xl bg-white/[0.18] px-2.5 py-1 text-[13px] font-bold">
              {formatHours(todayHours)} · {jobsLabel}
            </span>
          </div>
          <div className="relative text-[44px] font-extrabold leading-none tracking-[-1.5px]">
            {loading ? '…' : formatMoney(todayAmount)}
          </div>
          {pendingCount > 0 && (
            <button
              onClick={() => onTabChange('earnings')}
              className="relative mt-1 flex items-center gap-2.5 rounded-2xl bg-surface px-3 py-2.5 text-left text-ink"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-due-bg text-due">
                <Clock size={18} strokeWidth={2.4} aria-hidden="true" />
              </span>
              <span className="flex-1 text-sm font-semibold">
                <b className="font-extrabold text-due">{formatMoney(pendingTotal)}</b>{' '}
                {t('toCollectFrom', { n: pendingCount })}
              </span>
              <ChevronRight size={20} strokeWidth={2.6} className="text-primary" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Shortcut tiles */}
        <div className="grid grid-cols-3 gap-2.5">
          <Tile icon={UserPlus} iconClass="bg-mint-100 text-primary" label={t('tileAddCustomer')} onClick={() => setShowForm(true)} />
          <Tile icon={Wallet} iconClass="bg-amber-bg text-amber" label={t('tileGotPayment')} onClick={() => onTabChange('customers')} />
          <Tile icon={MessageCircle} iconClass="bg-blue-bg text-blue" label={t('tileSendReminders')} onClick={() => onTabChange('earnings')} />
        </div>

        {/* Today's jobs */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold tracking-[-0.3px]">{t('todaysJobs')}</h2>
            <button onClick={() => onTabChange('customers')} className="text-sm font-bold text-primary">
              {t('seeAll')}
            </button>
          </div>

          {loading && (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-mint-200 border-t-primary" />
            </div>
          )}

          {!loading && !error && todayRecs.length === 0 && (
            <div className="rounded-[18px] bg-surface px-4 py-6 text-center text-sm font-semibold text-muted shadow-card">
              {t('noJobsToday')}
            </div>
          )}

          {!loading && todayRecs.map((r) => {
            const c = customerMap[r.customer_id]
            return (
              <button
                key={r.id}
                onClick={() => onTabChange('customers')}
                className="flex items-center gap-3 rounded-[18px] bg-surface px-3.5 py-2.5 text-left text-ink shadow-card"
              >
                <Avatar id={r.customer_id} name={c?.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold">{c?.name ?? '—'}</span>
                  <span className="block text-[13px] font-medium text-muted">
                    {r.vehicle_type} · {formatHours(r.total_hours)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-base font-extrabold">{formatMoney(r.amount)}</span>
                  <StatusChip record={r} customer={c} />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <AddButton onClick={() => setShowForm(true)} ariaLabel={t('tileAddCustomer')} />

      {showForm && (
        <CustomerForm
          editing={null}
          ownerId={owner.id}
          onClose={() => setShowForm(false)}
          onSaved={(saved) => {
            setCustomers((prev) => [saved, ...prev])
            setShowForm(false)
          }}
        />
      )}

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}
