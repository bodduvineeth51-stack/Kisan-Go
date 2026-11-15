import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Mic, Check } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney } from '../lib/format'
import { moneyByCustomer, formatPhone } from '../lib/bills'
import { isSpeechSupported, listenOnce, speechErrorMessage } from '../lib/speech'
import { findCustomer } from '../lib/voiceParser'
import BottomNav from '../components/BottomNav'
import AddButton from '../components/AddButton'
import Avatar from '../components/Avatar'
import CustomerForm from '../components/CustomerForm'
import { useTrans } from '../context/LangContext'

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`h-11 shrink-0 rounded-[22px] px-4 text-sm ${
        active
          ? 'bg-primary font-extrabold text-white shadow-[0_6px_14px_rgba(21,128,61,0.25)]'
          : 'bg-surface font-semibold text-ink shadow-[0_2px_8px_rgba(15,42,26,0.06)]'
      }`}
    >
      {children}
    </button>
  )
}

export default function Customers({ owner, activeTab, onTabChange, onOpenCustomer, initialFilter = 'all' }) {
  const { t, lang } = useTrans()
  const [customers, setCustomers] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(initialFilter) // 'all' | 'due' | 'paid'
  const [showForm, setShowForm] = useState(false)
  const [listening, setListening] = useState(false)
  const [micError, setMicError] = useState('')
  const listenRef = useRef(null)

  async function fetchAll() {
    setLoading(true)
    setError('')
    const [cRes, rRes] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('work_records').select('id, customer_id, amount, created_at'),
    ])
    setLoading(false)
    if (cRes.error) { setError(cRes.error.message); return }
    if (rRes.error) { setError(rRes.error.message); return }
    setCustomers(cRes.data)
    setRecords(rRes.data)
  }

  useEffect(() => { fetchAll() }, [])
  useEffect(() => () => listenRef.current?.stop(), [])

  const money = useMemo(() => moneyByCustomer(customers, records), [customers, records])
  const dueCount = customers.filter((c) => money[c.id]?.owed > 0).length

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.filter((c) => {
      const owed = money[c.id]?.owed ?? 0
      if (filter === 'due' && owed <= 0) return false
      if (filter === 'paid' && owed > 0) return false
      if (!q) return true
      return c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\s/g, ''))
    })
  }, [customers, money, search, filter])

  async function voiceSearch() {
    if (listening) { listenRef.current?.stop(); return }
    setMicError('')
    const session = listenOnce({
      lang: lang === 'te' ? 'te-IN' : 'en-IN',
      onStart: () => setListening(true),
      onInterim: setSearch,
    })
    listenRef.current = session
    try {
      const text = await session.result
      // Telugu speech of an English-spelled name rarely matches letter for
      // letter, so prefer the closest customer name when there is one.
      const match = findCustomer(text, customers)
      setSearch(match ? match.name : text)
    } catch (err) {
      setMicError(speechErrorMessage(err, t))
    } finally {
      setListening(false)
    }
  }

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-5 pb-44 pt-4">
        <div className="flex h-11 items-center justify-between">
          <h1 className="text-[28px] font-extrabold tracking-[-0.8px]">{t('customersTab')}</h1>
          <span className="rounded-xl bg-mint-100 px-3 py-[5px] text-[13px] font-extrabold text-primary">
            {t('farmersCount', { n: customers.length })}
          </span>
        </div>

        {/* Search + voice */}
        <div className="flex h-14 items-center gap-2.5 rounded-[18px] bg-surface pl-4 shadow-card">
          <Search size={22} strokeWidth={2.2} className="shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="cust-search" className="sr-only">{t('searchCustomers')}</label>
          <input
            id="cust-search"
            type="search"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base font-medium text-ink outline-none placeholder:text-muted/70"
          />
          {isSpeechSupported() && (
            <button
              onClick={voiceSearch}
              aria-label={listening ? t('stopListening') : t('searchByVoice')}
              className={`relative mr-[5px] flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] text-white ${
                listening ? 'bg-danger' : 'bg-primary'
              }`}
            >
              <Mic size={20} strokeWidth={2.2} aria-hidden="true" />
              {listening && <span className="absolute inset-0 animate-ping rounded-[14px] bg-danger opacity-30" />}
            </button>
          )}
        </div>
        {micError && <p className="text-sm font-semibold text-danger">{micError}</p>}

        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto">
          <Pill active={filter === 'all'} onClick={() => setFilter('all')}>{t('filterAll')}</Pill>
          <Pill active={filter === 'due'} onClick={() => setFilter('due')}>
            {t('filterDue')}{dueCount > 0 ? ` · ${dueCount}` : ''}
          </Pill>
          <Pill active={filter === 'paid'} onClick={() => setFilter('paid')}>{t('paid')}</Pill>
        </div>

        {error && (
          <div className="rounded-[18px] bg-surface px-4 py-3 text-center shadow-card">
            <p className="text-sm font-semibold text-danger">{error}</p>
            <button onClick={fetchAll} className="mt-2 min-h-11 text-sm font-bold text-primary underline">
              {t('retry')}
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-mint-200 border-t-primary" />
          </div>
        )}

        {!loading && !error && customers.length === 0 && (
          <div className="rounded-[18px] bg-surface px-4 py-8 text-center shadow-card">
            <p className="text-base font-bold">{t('noCustomers')}</p>
            <p className="mt-1 text-sm font-medium text-muted">{t('noCustomersSub')}</p>
          </div>
        )}

        {!loading && customers.length > 0 && rows.length === 0 && (
          <p className="py-12 text-center text-sm font-semibold text-muted">
            {search ? t('noSearchMatch', { q: search }) : t('noneInFilter')}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {!loading && rows.map((c) => {
            const owed = money[c.id]?.owed ?? 0
            return (
              <button
                key={c.id}
                onClick={() => onOpenCustomer(c)}
                className="flex items-center gap-3 rounded-[18px] bg-surface px-3.5 py-2.5 text-left text-ink shadow-card active:scale-[0.99]"
              >
                <Avatar id={c.id} name={c.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold">{c.name}</span>
                  <span className="block text-[13px] font-medium text-muted">{formatPhone(c.phone)}</span>
                </span>
                {owed > 0 ? (
                  <span className="rounded-[10px] bg-due-bg px-2.5 py-1 text-sm font-extrabold text-due">
                    {formatMoney(owed)}
                  </span>
                ) : money[c.id]?.billed > 0 ? (
                  <span className="flex items-center gap-1 rounded-[10px] bg-mint-100 px-2.5 py-1 text-[13px] font-extrabold text-primary">
                    <Check size={14} strokeWidth={3.2} aria-hidden="true" />
                    {t('paid')}
                  </span>
                ) : null}
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
            onOpenCustomer(saved)
          }}
        />
      )}

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}
