import { useState, useEffect, useMemo } from 'react'
import { Check, Tractor } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney } from '../lib/format'
import { formatPhone } from '../lib/phone'
import { customerBalances } from '../lib/money'
import BottomNav from '../components/BottomNav'
import AddButton from '../components/AddButton'
import Avatar from '../components/Avatar'
import CustomerForm from '../components/CustomerForm'
import SearchBar, { FilterPills } from '../components/SearchBar'
import { PageHeader, Spinner, ErrorCard, EmptyCard, Chip } from '../components/ui'
import { useTrans } from '../context/LangContext'

// Owner's Customers tab (kisan-design/screens/5-customers.html).
// Tapping a customer opens their Customer page, where work is started.
export default function Dashboard({ owner, activeTab, onTabChange, onOpenCustomer, initialFilter = 'all' }) {
  const { t } = useTrans()
  const [customers, setCustomers] = useState([])
  const [workRecords, setWorkRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(initialFilter)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    setError('')
    const [cResult, rResult] = await Promise.all([
      supabase.from('customers').select('*').order('name', { ascending: true }),
      supabase.from('work_records').select('id, customer_id, amount, vehicle_type, created_at').order('created_at', { ascending: false }),
    ])
    setLoading(false)
    if (cResult.error) { setError(cResult.error.message); return }
    if (rResult.error) { setError(rResult.error.message); return }
    setCustomers(cResult.data)
    setWorkRecords(rResult.data)
  }

  const balances = useMemo(() => customerBalances(customers, workRecords), [customers, workRecords])
  // customer id → vehicles that did their work, most recently used first
  // (records arrive newest first). Tells the owner which machine — and so
  // which driver — worked for whom.
  const vehiclesOf = useMemo(() => {
    const out = {}
    for (const r of workRecords) {
      if (!r.vehicle_type) continue
      const list = (out[r.customer_id] ??= [])
      if (!list.includes(r.vehicle_type)) list.push(r.vehicle_type)
    }
    return out
  }, [workRecords])
  const dueOf = (c) => balances[c.id]?.due ?? 0
  const owingCount = customers.filter((c) => dueOf(c) > 0).length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q.replace(/\s/g, ''))) return false
      if (filter === 'due') return dueOf(c) > 0
      if (filter === 'paid') return c.is_paid && (balances[c.id]?.billed ?? 0) > 0
      return true
    })
  }, [customers, search, filter, balances]) // eslint-disable-line react-hooks/exhaustive-deps

  const filters = [
    ['all', t('filterAll')],
    ['due', owingCount ? t('filterDueN', { n: owingCount }) : t('filterDue')],
    ['paid', t('paid')],
  ]

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 px-5 pb-44 pt-4">
        <PageHeader title={t('customersTab')} chip={loading ? null : t('farmersCount', { n: customers.length })} />

        <SearchBar value={search} onChange={setSearch} />
        <FilterPills options={filters} value={filter} onChange={setFilter} />

        {error && <ErrorCard message={error} onRetry={fetchAll} />}
        {loading && <Spinner />}

        {!loading && !error && customers.length === 0 && (
          <EmptyCard title={t('noCustomers')} sub={t('noCustomersSub')} />
        )}
        {!loading && customers.length > 0 && filtered.length === 0 && (
          <p className="py-10 text-center text-sm font-semibold text-muted">
            {search ? t('noSearchMatch', { q: search }) : t('noFilterMatch')}
          </p>
        )}

        {!loading && filtered.length > 0 && (
          <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
            {filtered.map((c) => (
              <CustomerRow
                key={c.id}
                customer={c}
                due={dueOf(c)}
                billed={balances[c.id]?.billed ?? 0}
                vehicles={vehiclesOf[c.id]}
                onClick={() => onOpenCustomer(c)}
              />
            ))}
          </div>
        )}
      </div>

      <AddButton onClick={() => setShowForm(true)} ariaLabel={t('tileAddCustomer')} />

      {showForm && (
        <CustomerForm
          editing={null}
          ownerId={owner.id}
          onClose={() => setShowForm(false)}
          onSaved={(saved) => { setShowForm(false); onOpenCustomer(saved) }}
        />
      )}

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}

// One row of the grouped customers list. Second line: the vehicles that
// worked for this customer, or their number if no work is recorded yet.
export function CustomerRow({ customer, due = 0, billed = 0, vehicles = [], onClick }) {
  const { t } = useTrans()
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-divider px-3.5 py-3 text-left text-ink last:border-b-0 active:bg-mint-50"
    >
      <Avatar name={customer.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{customer.name}</span>
        {vehicles.length > 0 ? (
          <span className="flex items-center gap-1 text-[13px] font-medium text-muted">
            <Tractor size={14} strokeWidth={2.2} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{vehicles.join(' · ')}</span>
          </span>
        ) : (
          <span className="block text-[13px] font-medium text-muted">{formatPhone(customer.phone)}</span>
        )}
      </span>
      {due > 0 ? (
        <span className="shrink-0 text-base font-extrabold text-due">{formatMoney(due)}</span>
      ) : billed > 0 ? (
        <Chip small className="shrink-0">
          <Check size={12} strokeWidth={3.2} aria-hidden="true" />
          {t('paid')}
        </Chip>
      ) : null}
    </button>
  )
}
