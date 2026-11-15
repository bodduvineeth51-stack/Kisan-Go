import { useCallback, useEffect, useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { driverRpc, AccessRemovedError } from '../../lib/roles'
import { localDigits, formatPhone } from '../../lib/phone'
import BottomNav from '../../components/BottomNav'
import AddButton from '../../components/AddButton'
import Avatar from '../../components/Avatar'
import SearchBar from '../../components/SearchBar'
import { Sheet, Field, PhoneField, PrimaryButton, Spinner, ErrorCard, EmptyCard } from '../../components/ui'
import { useTrans } from '../../context/LangContext'
import DriverHeader from './DriverHeader'
import { DRIVER_TABS } from './tabs'

// Driver's customer list: name and phone only, from list_customers_basic.
// Never reads the customers table (drivers have no policy on it anyway).
export default function DriverCustomers({ me, onAccessRemoved, activeTab, onTabChange, onStartJob }) {
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
        <DriverHeader me={me} title={t('customersTab')} chip={loading ? null : t('farmersCount', { n: customers.length })} />

        <SearchBar value={search} onChange={setSearch} />

        {error && <ErrorCard message={error} onRetry={fetchCustomers} />}
        {loading && <Spinner />}
        {!loading && !error && customers.length === 0 && <EmptyCard title={t('noCustomers')} sub={t('noCustomersSub')} />}
        {!loading && customers.length > 0 && filtered.length === 0 && (
          <p className="py-10 text-center text-sm font-semibold text-muted">{t('noSearchMatch', { q: search })}</p>
        )}

        {!loading && filtered.length > 0 && (
          <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
            {filtered.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-b border-divider py-2.5 pl-3.5 pr-2.5 last:border-b-0">
                <Avatar name={c.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-ink">{c.name}</p>
                  <p className="text-[13px] font-medium text-muted">{formatPhone(c.phone)}</p>
                </div>
                <button
                  onClick={() => onStartJob(c)}
                  className="flex min-h-11 items-center gap-1.5 rounded-[14px] bg-primary pl-3 pr-3.5 text-sm font-bold text-white active:scale-95"
                >
                  <Play size={14} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                  {t('startWork')}
                </button>
              </div>
            ))}
          </div>
        )}
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

  return (
    <Sheet title={t('newCustomer')} onClose={onClose}>
      {existing ? (
        <div className="flex flex-col gap-3">
          <p className="text-lg font-bold text-ink">{t('customerExistsUse', { name: existing.name })}</p>
          <p className="text-sm font-medium text-muted">{formatPhone(existing.phone)}</p>
          <div className="mt-2 flex gap-2.5">
            <button onClick={() => setExisting(null)} className="min-h-[58px] flex-1 rounded-[18px] bg-mint-50 text-base font-bold text-ink">
              {t('cancel')}
            </button>
            <button
              onClick={() => onUseExisting(existing)}
              className="min-h-[58px] flex-1 rounded-[18px] bg-primary text-base font-extrabold text-white shadow-green"
            >
              {t('useThisCustomer')}
            </button>
          </div>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field
            id="new-customer-name"
            label={t('customerNameLabel')}
            placeholder={t('customerNameLabel')}
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <PhoneField id="new-customer-phone" label={t('phoneLabel')} value={phone} onChange={setPhone} />
          {error && <p role="alert" className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? t('savingProfile') : t('save')}
          </PrimaryButton>
        </form>
      )}
    </Sheet>
  )
}
