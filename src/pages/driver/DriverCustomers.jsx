import { useCallback, useEffect, useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { driverRpc, AccessRemovedError } from '../../lib/roles'
import { localDigits, formatPhone } from '../../lib/phone'
import BottomNav from '../../components/BottomNav'
import AddButton from '../../components/AddButton'
import Avatar from '../../components/Avatar'
import { useTrans } from '../../context/LangContext'
import DriverHeader from './DriverHeader'
import { DRIVER_TABS } from './tabs'

// Driver's customer list: name and phone only, from list_customers_basic.
// Never reads the customers table (drivers have no policy on it anyway).
export default function DriverCustomers({ me, onSignOut, onAccessRemoved, activeTab, onTabChange, onStartJob }) {
  const { t } = useTrans()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const fail = useCallback((err) => {
    if (err instanceof AccessRemovedError) { onAccessRemoved(); return }
    setError(err?.message || t('somethingWrong'))
  }, [onAccessRemoved, t])

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setCustomers(await driverRpc('list_customers_basic', undefined, { checkStatus: true }))
    } catch (err) {
      fail(err)
    } finally {
      setLoading(false)
    }
  }, [fail])

  useEffect(() => { fetchCustomers() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
  }, [customers, search])

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pb-44 pt-4">
        <DriverHeader me={me} title={t('customersTab')} onSignOut={onSignOut} />

        <input
          type="search"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-base font-semibold text-ink outline-none focus:border-primary"
        />

        {error && (
          <div className="rounded-[18px] bg-surface px-4 py-3 text-center shadow-card">
            <p className="text-sm font-semibold text-danger">{error}</p>
            <button onClick={fetchCustomers} className="mt-2 min-h-11 text-sm font-bold text-primary underline">
              {t('retry')}
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-mint-200 border-t-primary" />
          </div>
        )}

        {!loading && !error && customers.length === 0 && (
          <div className="rounded-[18px] bg-surface px-4 py-8 text-center shadow-card">
            <p className="text-base font-bold text-ink">{t('noCustomers')}</p>
            <p className="mt-1 text-sm font-medium text-muted">{t('noCustomersSub')}</p>
          </div>
        )}

        {!loading && customers.length > 0 && filtered.length === 0 && (
          <p className="py-10 text-center text-sm font-medium text-muted">{t('noSearchMatch', { q: search })}</p>
        )}

        {!loading && filtered.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-[18px] bg-surface px-3.5 py-3 shadow-card">
            <Avatar id={c.id} name={c.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-ink">{c.name}</p>
              <p className="text-[13px] font-medium text-muted">{formatPhone(c.phone)}</p>
            </div>
            <button
              onClick={() => onStartJob(c)}
              className="flex min-h-12 items-center gap-1.5 rounded-2xl bg-primary-bright px-4 text-sm font-extrabold text-white shadow-green active:scale-95"
            >
              <Play size={16} strokeWidth={2.6} aria-hidden="true" />
              {t('startJob')}
            </button>
          </div>
        ))}
      </div>

      <AddButton onClick={() => setShowAdd(true)} ariaLabel={t('tileAddCustomer')} />

      {showAdd && (
        <AddCustomerSheet
          onClose={() => setShowAdd(false)}
          onAccessRemoved={onAccessRemoved}
          onAdded={(c) => {
            setCustomers((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
            setShowAdd(false)
          }}
          onUseExisting={(c) => { setShowAdd(false); onStartJob(c) }}
        />
      )}

      <BottomNav active={activeTab} onChange={onTabChange} tabs={DRIVER_TABS} />
    </div>
  )
}

const ADD_ERRORS = { invalid_phone: 'validPhoneErr', name_required: 'enterCustomerName' }

// Add customer with the duplicate check:
//   find_customer_by_phone → "<name> already exists — use this customer?"
//   otherwise add_customer (which also catches a duplicate added a moment ago).
function AddCustomerSheet({ onClose, onAdded, onUseExisting, onAccessRemoved }) {
  const { t } = useTrans()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [existing, setExisting] = useState(null)

  function fail(err) {
    if (err instanceof AccessRemovedError) { onAccessRemoved(); return }
    const key = Object.keys(ADD_ERRORS).find((k) => (err?.message ?? '').includes(k))
    setError(key ? t(ADD_ERRORS[key]) : (err?.message || t('somethingWrong')))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError(t('enterCustomerName')); return }
    const digits = localDigits(phone)
    if (!digits) { setError(t('validPhoneErr')); return }

    setSaving(true)
    try {
      const found = await driverRpc('find_customer_by_phone', { p_phone: digits }, { checkStatus: true })
      if (found?.[0]) { setExisting(found[0]); return }

      const rows = await driverRpc('add_customer', { p_name: name.trim(), p_phone: digits })
      const row = rows?.[0]
      if (!row) throw new Error(t('somethingWrong'))
      const customer = { id: row.id, name: row.name, phone: row.phone }
      if (row.already_exists) setExisting(customer)
      else onAdded(customer)
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-base font-semibold text-ink outline-none focus:border-primary'
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-lg rounded-t-[26px] bg-surface px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold tracking-[-0.3px] text-ink">{t('newCustomer')}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center text-xl text-muted">✕</button>
        </div>

        {existing ? (
          <div className="flex flex-col gap-3">
            <p className="text-lg font-bold text-ink">{t('customerExistsUse', { name: existing.name })}</p>
            <p className="text-sm font-medium text-muted">{formatPhone(existing.phone)}</p>
            <div className="mt-2 flex gap-3">
              <button onClick={() => setExisting(null)} className="min-h-14 flex-1 rounded-2xl border border-border text-base font-bold text-ink">
                {t('cancel')}
              </button>
              <button
                onClick={() => onUseExisting(existing)}
                className="min-h-14 flex-1 rounded-2xl bg-primary text-base font-extrabold text-white shadow-green"
              >
                {t('useThisCustomer')}
              </button>
            </div>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder={t('customerNameLabel')}
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className={input}
            />
            <div className="flex items-center rounded-2xl border border-border bg-surface focus-within:border-primary">
              <span className="pl-4 text-base font-semibold text-muted">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={13}
                placeholder="9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-2xl px-2 py-3.5 text-base font-semibold text-ink outline-none"
              />
            </div>
            {error && <p className="text-sm font-semibold text-danger">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="mt-1 min-h-14 rounded-2xl bg-primary text-lg font-extrabold text-white shadow-green disabled:opacity-60"
            >
              {saving ? t('savingProfile') : t('save')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
