import { useState, useEffect, useRef } from 'react'
import { Check, RotateCw, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney, formatHours } from '../lib/format'
import { sendBill, billMessage, formatPhone } from '../lib/bills'
import { useTrans } from '../context/LangContext'

// Shown right after a job is saved. Sends the WhatsApp bill on arrival,
// shows how it went, and offers Retry when it failed.
export default function BillSent({ record, customer, onDone }) {
  const { t, lang } = useTrans()
  const [status, setStatus] = useState('sending') // 'sending' | 'sent' | 'failed'
  const [paid, setPaid] = useState(customer.is_paid)
  const [payError, setPayError] = useState('')
  const started = useRef(false)

  async function send() {
    setStatus('sending')
    setStatus(await sendBill(record, customer, lang))
  }

  useEffect(() => {
    if (started.current) return // StrictMode runs effects twice in dev
    started.current = true
    send()
  }, [])

  async function recordPayment() {
    setPayError('')
    setPaid(true)
    const { error } = await supabase.from('customers').update({ is_paid: true }).eq('id', customer.id)
    if (error) { setPaid(false); setPayError(error.message) }
  }

  const date = new Date(record.created_at).toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-IN', { day: 'numeric', month: 'short' })
  const preview = billMessage(lang, {
    name: customer.name,
    vehicle: record.vehicle_type,
    hours: Number(record.total_hours).toFixed(2),
    rate: record.hourly_rate,
    amount: record.amount,
  })

  const heading = {
    sending: t('sendingWaLabel'),
    sent:    t('billSentWhatsapp'),
    failed:  t('billNotSentTitle'),
  }[status]

  return (
    <div className="flex min-h-svh flex-col">
      {/* Green header */}
      <div className="relative flex flex-col items-center gap-2 overflow-hidden bg-primary px-6 pb-[70px] pt-10 text-center text-white">
        <div className="absolute -left-[50px] -top-10 h-40 w-40 rounded-full bg-circle-1 opacity-45" />
        <div className="absolute -right-[30px] bottom-2.5 h-[110px] w-[110px] rounded-full bg-circle-2 opacity-30" />
        <span
          className={`relative flex h-20 w-20 items-center justify-center rounded-full ${
            status === 'failed' ? 'bg-due-bg text-due' : 'bg-lime text-ink'
          } shadow-[0_0_0_10px_rgba(190,242,100,0.25)]`}
        >
          {status === 'sending' && <span className="h-9 w-9 animate-spin rounded-full border-4 border-ink/20 border-t-ink" />}
          {status === 'sent' && <Check size={42} strokeWidth={3} aria-hidden="true" />}
          {status === 'failed' && <RotateCw size={36} strokeWidth={2.6} aria-hidden="true" />}
        </span>
        <h1 className="relative mt-3.5 text-[26px] font-extrabold leading-[1.15] tracking-[-0.6px]" aria-live="polite">
          {heading}
        </h1>
        <div className="relative text-[15px] font-medium text-mint-100">
          {t('toCustomer', { name: customer.name, phone: formatPhone(customer.phone) })}
        </div>
      </div>

      <div className="relative mx-auto -mt-12 flex w-full max-w-lg flex-1 flex-col gap-4 px-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        {/* Bill card */}
        <div className="overflow-hidden rounded-3xl bg-surface shadow-[0_10px_28px_rgba(15,42,26,0.1)]">
          <div className="flex items-center justify-between border-b-2 border-dashed border-border px-[18px] py-3.5">
            <span className="text-lg font-extrabold">{t('billTitle')}</span>
            <span className="rounded-[10px] bg-mint-50 px-2.5 py-[3px] text-[13px] font-bold text-primary">
              {date} · {record.vehicle_type}
            </span>
          </div>
          <div className="flex flex-col gap-2 px-[18px] py-3 text-[15px]">
            {[
              [t('workSessions'), record.sessions?.length ?? 0],
              [t('totalTime'), formatHours(record.total_hours)],
              [t('rateLabel'), t('ratePerHour', { rate: formatMoney(record.hourly_rate) })],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="font-medium text-muted">{k}</span>
                <span className="font-bold">{v}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between bg-mint-100 px-[18px] py-3.5 text-primary">
            <span className="text-base font-extrabold">{t('totalLabel')}</span>
            <span className="text-[30px] font-extrabold leading-none tracking-[-1px]">{formatMoney(record.amount)}</span>
          </div>
        </div>

        {status === 'failed' && (
          <button
            onClick={send}
            className="flex h-[58px] items-center justify-center gap-2 rounded-[18px] bg-due-bg text-base font-extrabold text-due"
          >
            <RotateCw size={20} strokeWidth={2.6} aria-hidden="true" />
            {t('retryWhatsapp')}
          </button>
        )}

        {/* WhatsApp preview */}
        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] font-bold text-muted">{t('whatTheySee', { name: customer.name })}</div>
          <div className="max-w-[300px] self-start whitespace-pre-line rounded-[4px_18px_18px_18px] bg-surface px-3.5 py-2.5 text-sm font-medium leading-[1.45] shadow-card">
            {preview}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-2.5 pt-2">
          {payError && <p className="text-sm font-semibold text-danger">{payError}</p>}
          {paid ? (
            <div className="flex h-[58px] items-center justify-center gap-2 rounded-[18px] bg-mint-100 text-base font-extrabold text-primary">
              <Check size={20} strokeWidth={3} aria-hidden="true" />
              {t('paymentRecorded')}
            </div>
          ) : (
            <button
              onClick={recordPayment}
              className="flex h-[58px] items-center justify-center gap-2.5 rounded-[18px] bg-surface text-base font-extrabold text-primary shadow-card"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-amber-bg text-amber">
                <Wallet size={18} strokeWidth={2.2} aria-hidden="true" />
              </span>
              {t('gotCashNow')}
            </button>
          )}
          <button
            onClick={onDone}
            className="h-[62px] rounded-[20px] bg-primary text-xl font-extrabold text-white shadow-green"
          >
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  )
}
