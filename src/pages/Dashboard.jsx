import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import CustomerCard from '../components/CustomerCard'
import BottomNav from '../components/BottomNav'
import AddButton from '../components/AddButton'
import { useTrans, LangToggle } from '../context/LangContext'

export default function Dashboard({ owner, onSignOut, onStartJob, activeTab, onTabChange }) {
  const { t, lang } = useTrans()
  const [customers, setCustomers] = useState([])
  const [workRecords, setWorkRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [cResult, rResult] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('work_records').select('*').order('created_at', { ascending: false }),
    ])
    setLoading(false)
    if (cResult.error) { setError(cResult.error.message); return }
    if (rResult.error) { setError(rResult.error.message); return }
    setCustomers(cResult.data)
    setWorkRecords(rResult.data)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q),
    )
  }, [customers, search])

  async function handleTogglePaid(customer) {
    setError('')
    setCustomers((prev) =>
      prev.map((c) => c.id === customer.id ? { ...c, is_paid: !c.is_paid } : c),
    )
    const { error } = await supabase
      .from('customers')
      .update({ is_paid: !customer.is_paid })
      .eq('id', customer.id)
    if (error) {
      setCustomers((prev) =>
        prev.map((c) => c.id === customer.id ? { ...c, is_paid: customer.is_paid } : c),
      )
      setError(error.message)
    }
  }

  async function handleDelete(customer) {
    if (!window.confirm(t('deleteConfirm', { name: customer.name }))) return
    setError('')
    setCustomers((prev) => prev.filter((c) => c.id !== customer.id))
    const { error } = await supabase.from('customers').delete().eq('id', customer.id)
    if (error) { fetchAll(); setError(error.message) }
  }

  async function handleRetryWhatsapp(record) {
    const customer = customers.find((c) => c.id === record.customer_id)
    if (!customer) return
    setWorkRecords((prev) =>
      prev.map((r) => r.id === record.id ? { ...r, whatsapp_status: 'sending' } : r),
    )
    const { data } = await supabase.functions.invoke('send-whatsapp', {
      body: {
        record_id: record.id,
        customer_phone: customer.phone,
        customer_name: customer.name,
        vehicle_type: record.vehicle_type,
        total_hours: record.total_hours,
        hourly_rate: record.hourly_rate,
        amount: record.amount,
        lang,
      },
    })
    const newStatus = data?.whatsapp_status ?? 'failed'
    setWorkRecords((prev) =>
      prev.map((r) => r.id === record.id ? { ...r, whatsapp_status: newStatus } : r),
    )
  }

  function openAdd() { setEditing(null); setShowForm(true) }
  function openEdit(customer) { setEditing(customer); setShowForm(true) }

  const unpaidCount = customers.filter((c) => !c.is_paid).length

  return (
    <div className="flex min-h-svh flex-col pb-24">
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
        {unpaidCount > 0 && (
          <p className="mt-2 text-xs text-green-100">
            {t('unpaidCount', { n: unpaidCount, s: unpaidCount !== 1 ? 's' : '' })}
          </p>
        )}
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-44">
        <input
          type="search"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
        />

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={fetchAll}
              className="mt-2 text-sm font-semibold text-red-600 underline hover:text-red-700"
            >
              {t('retry')}
            </button>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-200 border-t-green-600" />
              <p className="text-sm text-gray-400">{t('loading')}</p>
            </div>
          )}

          {!loading && customers.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-gray-400">{t('noCustomers')}</p>
              <p className="mt-1 text-sm text-gray-400">{t('noCustomersSub')}</p>
            </div>
          )}

          {!loading && customers.length > 0 && filtered.length === 0 && (
            <p className="py-16 text-center text-sm text-gray-400">
              {t('noSearchMatch', { q: search })}
            </p>
          )}

          {filtered.map((c) => (
            <CustomerCard
              key={c.id}
              customer={c}
              records={workRecords.filter((r) => r.customer_id === c.id)}
              onTogglePaid={() => handleTogglePaid(c)}
              onDelete={() => handleDelete(c)}
              onEdit={() => openEdit(c)}
              onStartJob={() => onStartJob(c)}
              onRetryWhatsapp={(record) => handleRetryWhatsapp(record)}
            />
          ))}
        </div>
      </div>

      <AddButton onClick={openAdd} ariaLabel={t('addCustomer')} />

      {showForm && (
        <CustomerForm
          editing={editing}
          ownerId={owner.id}
          onClose={() => setShowForm(false)}
          onSaved={(saved) => {
            if (editing) {
              setCustomers((prev) => prev.map((c) => c.id === saved.id ? saved : c))
            } else {
              setCustomers((prev) => [saved, ...prev])
            }
            setShowForm(false)
          }}
        />
      )}

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}

export function CustomerForm({ editing, ownerId, onClose, onSaved }) {
  const { t } = useTrans()
  const [name, setName] = useState(editing?.name ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError(t('enterCustomerName')); return }
    if (!/^\d{10}$/.test(phone)) { setError(t('validPhoneErr')); return }

    setLoading(true)
    let result
    if (editing) {
      result = await supabase
        .from('customers')
        .update({ name: name.trim(), phone })
        .eq('id', editing.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('customers')
        .insert({ owner_id: ownerId, name: name.trim(), phone, is_paid: false })
        .select()
        .single()
    }
    setLoading(false)
    if (result.error) { setError(result.error.message); return }
    onSaved(result.data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white px-4 pb-8 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {editing ? t('editCustomer') : t('newCustomer')}
          </h2>
          <button
            onClick={onClose}
            className="text-xl leading-none text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder={t('customerNameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          />

          <div className="flex items-center rounded-xl border border-gray-300 focus-within:border-green-600 focus-within:ring-1 focus-within:ring-green-600">
            <span className="pl-4 text-sm text-gray-500">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-xl px-2 py-3 text-base outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white disabled:opacity-60 hover:bg-green-700"
            >
              {loading ? t('savingProfile') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
