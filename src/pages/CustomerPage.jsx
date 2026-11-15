import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Pencil, Phone, Play, RotateCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney, formatHours, initials } from '../lib/format'
import { formatPhone, localDigits, whatsappUrl } from '../lib/phone'
import { customerBalances, daysSince } from '../lib/money'
import { useRecordedBy } from '../lib/useRecordedBy'
import CustomerForm from '../components/CustomerForm'
import { BackButton, Bilingual, Chip, DateTile, ErrorCard, Spinner } from '../components/ui'
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
  const recordedBy = useRecordedBy(owner.id)

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

  const digits = localDigits(customer.phone)
  const reminder = t('reminderMessage', { name: customer.name, amount: formatMoney(balance.due), owner: owner.name })
  const paidAmount = balance.billed - balance.due
  const paidPct = balance.billed > 0 ? Math.round((paidAmount / balance.billed) * 100) : 0
  const waited = daysSince(balance.since)

  return (
    <div className="min-h-svh">
      <div className="mx-auto w-full max-w-lg">
        {/* Mint header */}
        <div className="relative flex flex-col gap-3.5 overflow-hidden bg-mint-100 px-5 pb-16 pt-4">
          <div className="absolute -right-[50px] -top-[50px] h-[180px] w-[180px] rounded-full bg-mint-200" />
          <div className="relative flex items-center gap-3">
            <BackButton onClick={onBack} flat />
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[18px] bg-primary text-lg font-extrabold text-white">
              {initials(customer.name)}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-extrabold leading-[1.1] tracking-[-0.6px]">{customer.name}</h1>
              <p className="text-[13px] font-semibold text-mint-ink">{formatPhone(customer.phone)}</p>
            </div>
            <button
              onClick={() => setEditing(true)}
              aria-label={t('editCustomer')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface text-primary"
            >
              <Pencil size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
          <div className="relative grid grid-cols-2 gap-2.5">
            <a
              href={digits ? `tel:+91${digits}` : undefined}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface text-[15px] font-bold text-ink"
            >
              <Phone size={18} strokeWidth={2.2} className="text-primary" aria-hidden="true" />
              {t('call')}
            </a>
            <a
              href={whatsappUrl(customer.phone) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface text-[15px] font-bold text-ink"
            >
              <MessageCircle size={18} strokeWidth={2.2} className="text-primary" aria-hidden="true" />
              WhatsApp
            </a>
          </div>
        </div>

        <div className="relative -mt-12 flex flex-col gap-3.5 px-5 pb-10">
          {/* Start work */}
          <button
            onClick={() => onStartJob(customer)}
            className="flex h-20 shrink-0 items-center gap-4 rounded-3xl bg-primary-bright px-[18px] text-left text-white shadow-start active:scale-[0.98]"
          >
            <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-surface shadow-[0_0_0_6px_rgba(255,255,255,0.25)]">
              <Play size={24} fill="#15803D" strokeWidth={0} aria-hidden="true" />
            </span>
            <span className="flex-1 text-[22px] font-extrabold tracking-[-0.5px]">
              <Bilingual k="startWork" subClass="text-sm font-medium tracking-normal text-mint-100" />
            </span>
          </button>

          {error && <ErrorCard message={error} onRetry={fetchAll} />}

          {/* Owes you */}
          <div className="flex flex-col gap-3 rounded-3xl bg-surface px-[18px] py-4 shadow-raised">
            {balance.billed === 0 ? (
              <div>
                <p className="text-[13px] font-bold text-muted">{t('owesYou')}</p>
                <p className="text-[40px] font-extrabold leading-[1.05] tracking-[-1.5px] text-ink">{formatMoney(0)}</p>
                <p className="mt-1 text-sm font-medium text-muted">{t('noWorkYet')}</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-bold text-muted">{balance.due > 0 ? t('owesYou') : t('allPaidUp')}</p>
                    <p className={`text-[40px] font-extrabold leading-[1.05] tracking-[-1.5px] ${balance.due > 0 ? 'text-due' : 'text-primary'}`}>
                      {formatMoney(balance.due > 0 ? balance.due : balance.billed)}
                    </p>
                  </div>
                  {balance.due > 0
                    ? <Chip tone="due" className="rounded-[10px] text-xs">{t('daysCount', { n: waited })}</Chip>
                    : <Chip className="rounded-[10px] text-xs">{t('paid')}</Chip>}
                </div>
                <div className="h-2.5 overflow-hidden rounded-[5px] bg-due-bg">
                  <div className="h-full rounded-[5px] bg-primary-bright" style={{ width: `${paidPct}%` }} />
                </div>
                <div className="flex justify-between text-[13px] font-semibold text-muted">
                  <span>{t('paid')} <b className="text-primary">{formatMoney(paidAmount)}</b></span>
                  <span>{t('billed')} <b className="text-ink">{formatMoney(balance.billed)}</b></span>
                </div>
                <div className="flex gap-2.5">
                  {balance.due > 0 ? (
                    <>
                      <button
                        onClick={togglePaid}
                        className="h-[50px] flex-1 rounded-2xl bg-primary text-base font-extrabold text-white shadow-[0_8px_18px_rgba(21,128,61,0.28)] active:scale-[0.98]"
                      >
                        {t('markPaid')}
                      </button>
                      <a
                        href={whatsappUrl(customer.phone, reminder) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-[50px] items-center rounded-2xl bg-due-bg px-4 text-[15px] font-extrabold text-due"
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
          <div className="flex flex-col gap-2">
            <h2 className="text-[17px] font-extrabold">{t('history')}</h2>
            {records.length === 0 && (
              <p className="rounded-2xl bg-surface px-4 py-5 text-center text-sm font-semibold text-muted shadow-card">{t('noWorkYet')}</p>
            )}
            {records.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-[9px] shadow-card">
                <DateTile iso={r.created_at} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{r.vehicle_type} · {formatHours(r.total_hours)}</span>
                  <WhatsAppLine record={r} onRetry={() => retryWhatsapp(r)} />
                  {recordedBy(r) && <span className="block truncate text-xs font-medium text-muted">{recordedBy(r)}</span>}
                </span>
                <span className="text-[15px] font-extrabold">{formatMoney(r.amount)}</span>
              </div>
            ))}
          </div>
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

function WhatsAppLine({ record, onRetry }) {
  const { t } = useTrans()
  if (record.whatsapp_status === 'sent') {
    return <span className="block text-xs font-semibold text-primary">{t('billSentWhatsApp')}</span>
  }
  if (record.whatsapp_status === 'sending') {
    return <span className="block text-xs font-semibold text-muted">{t('whatsappSending')}</span>
  }
  return (
    <button onClick={onRetry} className="-my-2 flex min-h-11 items-center gap-1 text-xs font-extrabold text-due">
      <RotateCw size={13} strokeWidth={2.6} aria-hidden="true" />
      {t('whatsappRetry')}
    </button>
  )
}
