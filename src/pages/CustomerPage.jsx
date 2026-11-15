import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Play, RotateCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney, formatHours } from '../lib/format'
import { formatPhone, whatsappUrl } from '../lib/phone'
import { customerBalances, daysSince } from '../lib/money'
import CustomerForm from '../components/CustomerForm'
import { BackButton, Chip, DateTile, ErrorCard, Spinner } from '../components/ui'
import { useTrans } from '../context/LangContext'

// Owner's Customer page (kisan-design/screens/6-customer-page.html).
// Start work lives here, at the top.
export default function CustomerPage({ owner, customerId, onBack, onStartJob, onDeleted }) {
  const { t, lang } = useTrans()
  const [customer, setCustomer] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  async function fetchAll() {
    setLoading(true)
    setError('')
    const [cRes, rRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).maybeSingle(),
      supabase.from('work_records').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
    ])
    setLoading(false)
    if (cRes.error) { setError(cRes.error.message); return }
    if (rRes.error) { setError(rRes.error.message); return }
    if (!cRes.data) { setError(t('errCustomerGone')); return }
    setCustomer(cRes.data)
    setRecords(rRes.data)
  }

  useEffect(() => { fetchAll() }, [customerId]) // eslint-disable-line react-hooks/exhaustive-deps

  const balance = useMemo(
    () => (customer ? customerBalances([customer], records)[customer.id] : null) ?? { billed: 0, due: 0, since: null },
    [customer, records],
  )

  async function togglePaid() {
    const next = !customer.is_paid
    setError('')
    setCustomer((c) => ({ ...c, is_paid: next }))
    const { error } = await supabase.from('customers').update({ is_paid: next }).eq('id', customer.id)
    if (error) {
      setCustomer((c) => ({ ...c, is_paid: !next }))
      setError(error.message)
    }
  }

  async function retryWhatsapp(record) {
    setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, whatsapp_status: 'sending' } : r)))
    let status = 'failed'
    try {
      // The function looks up the bill (customer, hours, amount) from the record.
      const { data } = await supabase.functions.invoke('send-whatsapp', { body: { record_id: record.id, lang } })
      status = data?.whatsapp_status ?? 'failed'
    } catch { /* stays failed — Retry is still shown */ }
    setRecords((prev) => prev.map((r) => (r.id === record.id ? { ...r, whatsapp_status: status } : r)))
  }

  if (loading && !customer) {
    return <div className="mx-auto max-w-lg px-5 pt-4"><BackButton onClick={onBack} /><Spinner label={t('loading')} /></div>
  }
  if (!customer) {
    return <div className="mx-auto flex max-w-lg flex-col gap-4 px-5 pt-4"><BackButton onClick={onBack} /><ErrorCard message={error} onRetry={fetchAll} /></div>
  }

  const reminder = t('reminderMessage', { name: customer.name, amount: formatMoney(balance.due), owner: owner.name })
  const waited = daysSince(balance.since)

  return (
    <div className="min-h-svh">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex flex-col gap-4 px-5 pb-10 pt-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <BackButton onClick={onBack} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[22px] font-extrabold leading-[1.15] tracking-[-0.5px]">{customer.name}</h1>
              <p className="text-[13px] font-medium text-muted">{formatPhone(customer.phone)}</p>
            </div>
            <button
              onClick={() => setEditing(true)}
              aria-label={t('editCustomer')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface text-primary shadow-soft"
            >
              <Pencil size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>

          {/* Start work */}
          <button
            onClick={() => onStartJob(customer)}
            className="flex h-[68px] shrink-0 items-center justify-center gap-3 rounded-[20px] bg-primary text-white shadow-start active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden="true" />
            </span>
            <span className="text-xl font-extrabold tracking-[-0.3px]">{t('startWork')}</span>
          </button>

          {error && <ErrorCard message={error} onRetry={fetchAll} />}

          {/* Owes you */}
          <div className="flex flex-col gap-3 rounded-[20px] bg-surface px-[18px] py-4 shadow-card">
            {balance.billed === 0 ? (
              <p className="py-2 text-center text-[15px] font-semibold text-muted">{t('noWorkYet')}</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-bold text-muted">{balance.due > 0 ? t('owesYou') : t('allPaidUp')}</p>
                    <p className={`text-[34px] font-extrabold leading-[1.1] tracking-[-1px] ${balance.due > 0 ? 'text-due' : 'text-primary'}`}>
                      {formatMoney(balance.due > 0 ? balance.due : balance.billed)}
                    </p>
                  </div>
                  {balance.due > 0
                    ? <Chip tone="due" className="rounded-[10px] text-xs">{t('daysCount', { n: waited })}</Chip>
                    : <Chip className="rounded-[10px] text-xs">{t('paid')}</Chip>}
                </div>
                <div className="flex gap-2.5">
                  {balance.due > 0 ? (
                    <>
                      <button
                        onClick={togglePaid}
                        className="h-[50px] flex-1 rounded-2xl bg-primary text-base font-bold text-white active:scale-[0.98]"
                      >
                        {t('markPaid')}
                      </button>
                      <a
                        href={whatsappUrl(customer.phone, reminder) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-[50px] items-center rounded-2xl bg-due-bg px-4 text-[15px] font-bold text-due"
                      >
                        {t('remind')}
                      </a>
                    </>
                  ) : (
                    <button onClick={togglePaid} className="h-[50px] flex-1 rounded-2xl bg-mint-50 text-base font-bold text-primary">
                      {t('markUnpaid')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* History */}
          {records.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-[17px] font-extrabold">{t('history')}</h2>
              <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
                {records.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 border-b border-divider px-3.5 py-2.5 last:border-b-0">
                    <DateTile iso={r.created_at} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">{r.vehicle_type} · {formatHours(r.total_hours)}</span>
                      <WhatsAppLine record={r} onRetry={() => retryWhatsapp(r)} />
                    </span>
                    <span className="text-[15px] font-extrabold">{formatMoney(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <CustomerForm
          editing={customer}
          ownerId={owner.id}
          onClose={() => setEditing(false)}
          onSaved={(saved) => { setCustomer(saved); setEditing(false) }}
          onDeleted={onDeleted}
        />
      )}
    </div>
  )
}

// Short bill status under each history row: a small tick when sent,
// Retry when it didn't go.
function WhatsAppLine({ record, onRetry }) {
  const { t } = useTrans()
  if (record.whatsapp_status === 'sent') {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-muted">
        <Check size={13} strokeWidth={3} className="text-primary" aria-hidden="true" />
        {t('billSent')}
      </span>
    )
  }
  if (record.whatsapp_status === 'sending') {
    return <span className="block text-xs font-semibold text-muted">{t('whatsappSending')}</span>
  }
  return (
    <button onClick={onRetry} className="-my-2 flex min-h-11 items-center gap-1 text-xs font-bold text-due">
      <RotateCw size={13} strokeWidth={2.6} aria-hidden="true" />
      {t('whatsappRetry')}
    </button>
  )
}
