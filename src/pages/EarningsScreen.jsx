import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import BottomNav from '../components/BottomNav'
import { useTrans, LangToggle } from '../context/LangContext'

function fmt(amount) {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

function StatRow({ label, amount, highlight }) {
  return (
    <div className="flex items-baseline justify-between py-3">
      <span className="text-base text-gray-500">{label}</span>
      <span
        className={`text-2xl font-black tabular-nums ${
          highlight === 'green'
            ? 'text-green-600'
            : highlight === 'orange'
              ? 'text-orange-500'
              : 'text-gray-900'
        }`}
      >
        {fmt(amount)}
      </span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{title}</p>
      </div>
      <div className="divide-y divide-gray-100 px-4">{children}</div>
    </div>
  )
}

function computeTotals(records, paidIds) {
  const earned    = records.reduce((s, r) => s + Number(r.amount), 0)
  const collected = records.filter((r) => paidIds.has(r.customer_id)).reduce((s, r) => s + Number(r.amount), 0)
  return { earned, collected, pending: earned - collected }
}

export default function EarningsScreen({ owner, onSignOut, activeTab, onTabChange }) {
  const { t } = useTrans()
  const [customers, setCustomers]     = useState([])
  const [workRecords, setWorkRecords] = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  async function fetchAll() {
    setLoading(true)
    setError('')
    const [cRes, rRes] = await Promise.all([
      supabase.from('customers').select('id, name, is_paid'),
      supabase.from('work_records').select('id, customer_id, amount, created_at'),
    ])
    setLoading(false)
    if (cRes.error) { setError(cRes.error.message); return }
    if (rRes.error) { setError(rRes.error.message); return }
    setCustomers(cRes.data)
    setWorkRecords(rRes.data)
  }

  useEffect(() => { fetchAll() }, [])

  const { todayTotals, seasonTotals, pendingList } = useMemo(() => {
    const paidIds = new Set(customers.filter((c) => c.is_paid).map((c) => c.id))

    const now      = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayEnd   = new Date(dayStart.getTime() + 86_400_000)
    const todayRecs = workRecords.filter((r) => {
      const d = new Date(r.created_at)
      return d >= dayStart && d < dayEnd
    })

    const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]))
    const pendingMap  = {}
    for (const r of workRecords) {
      const c = customerMap[r.customer_id]
      if (!c || c.is_paid) continue
      pendingMap[c.id] = (pendingMap[c.id] ?? 0) + Number(r.amount)
    }
    const pendingList = Object.entries(pendingMap)
      .map(([id, total]) => ({ customer: customerMap[id], total }))
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total)

    return {
      todayTotals:  computeTotals(todayRecs, paidIds),
      seasonTotals: computeTotals(workRecords, paidIds),
      pendingList,
    }
  }, [customers, workRecords])

  return (
    <div className="flex min-h-svh flex-col bg-gray-50 pb-16">
      {/* Header */}
      <header className="bg-green-600 px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Kisan Go</h1>
            <p className="text-xs text-green-100">{owner.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle variant="dark" />
            <button
              onClick={onSignOut}
              className="rounded-lg border border-green-500 px-3 py-1.5 text-xs font-medium text-green-100 hover:bg-green-700"
            >
              {t('signOut')}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-4">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
            <p className="text-sm text-gray-400">{t('loading')}</p>
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={fetchAll}
              className="mt-2 text-sm font-semibold text-red-600 underline hover:text-red-700"
            >
              {t('retry')}
            </button>
          </div>
        )}

        {!loading && (
          <>
            <Section title={t('todaySection')}>
              <StatRow label={t('earnedLabel')}    amount={todayTotals.earned}    />
              <StatRow label={t('collectedLabel')} amount={todayTotals.collected} highlight="green"  />
              <StatRow label={t('pendingLabel')}   amount={todayTotals.pending}   highlight={todayTotals.pending > 0 ? 'orange' : undefined} />
            </Section>

            <Section title={t('seasonSection')}>
              <StatRow label={t('earnedLabel')}    amount={seasonTotals.earned}    />
              <StatRow label={t('collectedLabel')} amount={seasonTotals.collected} highlight="green"  />
              <StatRow label={t('pendingLabel')}   amount={seasonTotals.pending}   highlight={seasonTotals.pending > 0 ? 'orange' : undefined} />
            </Section>

            <Section title={t('pendingCollections', { n: pendingList.length })}>
              {pendingList.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-400">{t('allPaidMsg')}</p>
              )}
              {pendingList.map(({ customer, total }) => (
                <div key={customer.id} className="flex items-center justify-between py-3">
                  <p className="font-semibold text-gray-900">{customer.name}</p>
                  <span className="text-lg font-black text-orange-500">{fmt(total)}</span>
                </div>
              ))}
            </Section>
          </>
        )}
      </div>

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}
