import { useState, useEffect } from 'react'
import { ChevronLeft, Phone, MessageCircle, Play, Check, RotateCw, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney, formatHours } from '../lib/format'
import { sendBill, reminderLink, chatLink, formatPhone, daysSince } from '../lib/bills'
import CustomerForm from '../components/CustomerForm'
import { useTrans } from '../context/LangContext'

function DateTile({ iso, lang }) {
  const d = new Date(iso)
  const month = d.toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-IN', { month: 'short' })
  return (
    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-mint-50 text-[11px] font-extrabold uppercase leading-[1.1] text-primary">
      <span className="text-[15px]">{d.getDate()}</span>
      {month}
    </span>
  )
}

function BillStatus({ record, onRetry }) {
  const { t } = useTrans()
  if (record.whatsapp_status === 'sent') {
    return <span className="block text-xs font-semibold text-primary">{t('billSentWhatsapp')}</span>
  }
  if (record.whatsapp_status === 'sending') {
    return <span className="block text-xs font-semibold text-muted">{t('whatsappSending')}</span>
  }
  return (
    <button
      onClick={onRetry}
      className="-my-2 flex min-h-11 items-center gap-1 text-xs font-extrabold text-due"
    >
      <RotateCw size={13} strokeWidth={2.6} aria-hidden="true" />
      {t('notSentRetry')}
    </button>
  )
}

export default function CustomerPage({ owner, customer: initialCustomer, onBack, onStartWork }) {
  const { t, lang } = useTrans()
  const [customer, setCustomer] = useState(initialCustomer)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [savingPaid, setSavingPaid] = useState(false)

  async function fetchAll() {
    setLoading(true)
    setError('')
    const [cRes, rRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', initialCustomer.id).single(),
      supabase.from('work_records').select('*').eq('customer_id', initialCustomer.id)
        .order('created_at', { ascending: false }),
    ])
    setLoading(false)
    if (cRes.error) { setError(cRes.error.message); return }
    if (rRes.error) { setError(rRes.error.message); return }
    setCustomer(cRes.data)
    setRecords(rRes.data)
  }

  useEffect(() => { fetchAll() }, [initialCustomer.id])

  const billed = records.reduce((s, r) => s + Number(r.amount), 0)
  const owed = customer.is_paid ? 0 : billed
  const oldest = records.length ? new Date(records[records.length - 1].created_at) : null
  const days = daysSince(oldest)

  async function setPaid(isPaid) {
    setError('')
    setSavingPaid(true)
    const prev = customer.is_paid
    setCustomer((c) => ({ ...c, is_paid: isPaid }))
    const { error } = await supabase.from('customers').update({ is_paid: isPaid }).eq('id', customer.id)
    setSavingPaid(false)
    if (error) {
      setCustomer((c) => ({ ...c, is_paid: prev }))
      setError(error.message)
    }
  }

  async function retry(record) {
    setRecords((prev) => prev.map((r) => r.id === record.id ? { ...r, whatsapp_status: 'sending' } : r))
    const status = await sendBill(record, customer, lang)
    setRecords((prev) => prev.map((r) => r.id === record.id ? { ...r, whatsapp_status: status } : r))
  }

  async function handleDelete() {
    if (!window.confirm(t('deleteConfirm', { name: customer.name }))) return
    const { error } = await supabase.from('customers').delete().eq('id', customer.id)
    if (error) { setError(error.message); return }
    onBack()
  }

  const whiteBtn = 'flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface text-[15px] font-bold text-ink'

  return (
    <div className="min-h-svh">
      {/* Mint header */}
      <div className="relative overflow-hidden bg-mint-100 px-5 pb-16 pt-4">
        <div className="absolute -right-[50px] -top-[50px] h-[180px] w-[180px] rounded-full bg-mint-200" />
        <div className="relative mx-auto flex max-w-lg flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              aria-label={t('back')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface text-ink"
            >
              <ChevronLeft size={22} strokeWidth={2.4} aria-hidden="true" />
            </button>
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[18px] bg-primary text-lg font-extrabold text-white">
              {customer.name.trim().slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-extrabold leading-[1.1] tracking-[-0.6px]">{customer.name}</h1>
              <div className="text-[13px] font-semibold text-[#166534]">{formatPhone(customer.phone)}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <a href={`tel:+91${customer.phone}`} className={whiteBtn}>
              <Phone size={18} strokeWidth={2.2} className="text-primary" aria-hidden="true" />
              {t('call')}
            </a>
            <a href={chatLink(customer)} target="_blank" rel="noreferrer" className={whiteBtn}>
              <MessageCircle size={18} strokeWidth={2.2} className="text-primary" aria-hidden="true" />
              WhatsApp
            </a>
          </div>
        </div>
      </div>

      <div className="relative mx-auto -mt-12 flex max-w-lg flex-col gap-3.5 px-5 pb-10">
        {/* Start work */}
        <button
          onClick={() => onStartWork(customer)}
          className="flex h-20 shrink-0 items-center gap-4 rounded-3xl bg-primary-bright px-[18px] text-left text-white shadow-[0_10px_24px_rgba(22,163,74,0.35)] active:scale-[0.98]"
        >
          <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-surface shadow-[0_0_0_6px_rgba(255,255,255,0.25)]">
            <Play size={24} fill="#15803D" strokeWidth={0} aria-hidden="true" />
          </span>
          <span className="flex-1">
            <span className="block text-[22px] font-extrabold leading-[1.15] tracking-[-0.5px]">Start work</span>
            <span className="block text-sm font-medium text-mint-100">పని మొదలుపెట్టండి</span>
          </span>
        </button>

        {error && (
          <div className="rounded-[18px] bg-surface px-4 py-3 text-center shadow-card">
            <p className="text-sm font-semibold text-danger">{error}</p>
            <button onClick={fetchAll} className="mt-2 min-h-11 text-sm font-bold text-primary underline">
              {t('retry')}
            </button>
          </div>
        )}

        {/* Owes-you card */}
        {!loading && (
          <div className="flex flex-col gap-3 rounded-3xl bg-surface px-[18px] py-4 shadow-[0_10px_28px_rgba(15,42,26,0.1)]">
            {owed > 0 ? (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[13px] font-bold text-muted">{t('owesYou')}</div>
                    <div className="text-[40px] font-extrabold leading-[1.05] tracking-[-1.5px] text-due">
                      {formatMoney(owed)}
                    </div>
                  </div>
                  <span className="rounded-[10px] bg-due-bg px-2.5 py-1 text-xs font-extrabold text-due">
                    {t('daysCount', { n: days })}
                  </span>
                </div>
                <div className="text-[13px] font-semibold text-muted">
                  {t('billedLabel')} <b className="text-ink">{formatMoney(billed)}</b>
                  {' · '}{t(records.length === 1 ? 'jobCount' : 'jobsCount', { n: records.length })}
                </div>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => setPaid(true)}
                    disabled={savingPaid}
                    className="h-[50px] flex-1 rounded-2xl bg-primary text-base font-extrabold text-white shadow-[0_8px_18px_rgba(21,128,61,0.28)] disabled:opacity-60"
                  >
                    {t('recordPayment')}
                  </button>
                  <a
                    href={reminderLink(customer, owed, lang)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-[50px] items-center rounded-2xl bg-due-bg px-4 text-[15px] font-extrabold text-due"
                  >
                    {t('remind')}
                  </a>
                </div>
              </>
            ) : billed > 0 ? (
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-mint-100 text-primary">
                  <Check size={22} strokeWidth={3} aria-hidden="true" />
                </span>
                <div className="flex-1">
                  <div className="text-lg font-extrabold text-primary">{t('allPaid')}</div>
                  <div className="text-[13px] font-semibold text-muted">
                    {t('billedLabel')} <b className="text-ink">{formatMoney(billed)}</b>
                  </div>
                </div>
                <button
                  onClick={() => setPaid(false)}
                  disabled={savingPaid}
                  className="min-h-11 rounded-xl bg-mint-50 px-3 text-[13px] font-bold text-muted"
                >
                  {t('markUnpaid')}
                </button>
              </div>
            ) : (
              <div className="py-1 text-center text-sm font-semibold text-muted">{t('noBillsYet')}</div>
            )}
          </div>
        )}

        {/* History */}
        <div className="flex flex-col gap-2">
          <h2 className="text-[17px] font-extrabold">{t('history')}</h2>
          {loading && (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-mint-200 border-t-primary" />
            </div>
          )}
          {!loading && records.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-[9px] shadow-[0_4px_14px_rgba(15,42,26,0.05)]"
            >
              <DateTile iso={r.created_at} lang={lang} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">
                  {r.vehicle_type} · {formatHours(r.total_hours)}
                </span>
                <BillStatus record={r} onRetry={() => retry(r)} />
              </span>
              <span className="text-[15px] font-extrabold">{formatMoney(r.amount)}</span>
            </div>
          ))}
        </div>

        {/* Edit / delete (delete = season-end cleanup) */}
        <div className="mt-2 grid grid-cols-2 gap-2.5">
          <button
            onClick={() => setEditing(true)}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface text-sm font-bold text-ink shadow-card"
          >
            <Pencil size={16} strokeWidth={2.2} aria-hidden="true" />
            {t('editDetails')}
          </button>
          <button
            onClick={handleDelete}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface text-sm font-bold text-danger shadow-card"
          >
            <Trash2 size={16} strokeWidth={2.2} aria-hidden="true" />
            {t('deleteCustomer')}
          </button>
        </div>
      </div>

      {editing && (
        <CustomerForm
          editing={customer}
          ownerId={owner.id}
          onClose={() => setEditing(false)}
          onSaved={(saved) => { setCustomer(saved); setEditing(false) }}
        />
      )}
    </div>
  )
}
