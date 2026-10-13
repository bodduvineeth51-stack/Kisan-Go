import { useState } from 'react'
import { Check, MessageCircle } from 'lucide-react'
import { useTrans } from '../context/LangContext'
import { formatHours, formatMoney } from '../lib/format'
import { billLink, billMessage } from '../lib/whatsapp'

// Shown after a job is saved: the bill, the message the customer will get, and
// a button that opens WhatsApp with that message ready to send.
export default function BillReady({ customer, record, onSent, onDone }) {
  const { t, lang } = useTrans()
  const [opened, setOpened] = useState(record.whatsapp_status === 'sent')

  const message = billMessage(lang, {
    name: customer.name,
    vehicle: record.vehicle_type,
    hours: record.total_hours,
    rate: record.hourly_rate,
    amount: record.amount,
  })

  function handleSend() {
    if (!opened) onSent(record)
    setOpened(true)
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg text-ink">
      <div className="relative flex flex-col items-center gap-2 overflow-hidden bg-primary px-6 pb-[70px] pt-10 text-center text-white">
        <div className="absolute -left-[50px] -top-10 h-40 w-40 rounded-full bg-circle-1 opacity-45" />
        <div className="absolute -right-[30px] bottom-2.5 h-[110px] w-[110px] rounded-full bg-circle-2 opacity-30" />
        <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-lime text-ink shadow-[0_0_0_10px_rgba(190,242,100,0.25)]">
          <Check size={42} strokeWidth={3} aria-hidden="true" />
        </span>
        <h1 className="relative mt-3.5 text-[26px] font-extrabold leading-tight tracking-tight">
          {t('billSaved')}
        </h1>
        <p className="relative text-[15px] font-medium text-mint-100">
          {customer.name} · +91 {customer.phone}
        </p>
      </div>

      <div className="relative -mt-12 flex flex-1 flex-col gap-4 px-5 pb-5">
        <div className="overflow-hidden rounded-[24px] bg-surface shadow-[0_10px_28px_rgba(15,42,26,0.1)]">
          <div className="flex items-center justify-between border-b-2 border-dashed border-border px-[18px] py-3.5">
            <span className="text-lg font-extrabold">{t('bill')}</span>
            <span className="rounded-[10px] bg-mint-50 px-2.5 py-[3px] text-[13px] font-bold text-primary">
              {record.vehicle_type}
            </span>
          </div>
          <div className="flex flex-col gap-2 px-[18px] py-3 text-[15px]">
            <div className="flex justify-between">
              <span className="font-medium text-muted">{t('totalTime')}</span>
              <span className="font-bold">{formatHours(record.total_hours)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-muted">{t('rate')}</span>
              <span className="font-bold">
                {formatMoney(record.hourly_rate)} / {t('hrShort')}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between bg-mint-100 px-[18px] py-3.5 text-primary">
            <span className="text-base font-extrabold">{t('total')}</span>
            <span className="text-[30px] font-extrabold leading-none tracking-tight">
              {formatMoney(record.amount)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-bold text-muted">
            {t('whatCustomerSees', { name: customer.name })}
          </p>
          <p className="max-w-[300px] self-start whitespace-pre-line rounded-[4px_18px_18px_18px] bg-surface px-3.5 py-2.5 text-sm font-medium leading-[1.45] shadow-card">
            {message}
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-2.5">
          <a
            href={billLink(lang, customer, record)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleSend}
            className={
              opened
                ? 'flex h-[58px] items-center justify-center gap-2.5 rounded-[18px] bg-surface text-base font-extrabold text-primary shadow-card'
                : 'flex h-[62px] items-center justify-center gap-2.5 rounded-[20px] bg-primary text-xl font-extrabold text-white shadow-green active:scale-[0.98]'
            }
          >
            <MessageCircle size={opened ? 20 : 24} strokeWidth={2.4} aria-hidden="true" />
            {opened ? t('sendAgain') : t('sendOnWhatsapp')}
          </a>
          <button
            type="button"
            onClick={onDone}
            className={
              opened
                ? 'h-[62px] rounded-[20px] bg-primary text-xl font-extrabold text-white shadow-green active:scale-[0.98]'
                : 'h-[58px] rounded-[18px] bg-surface text-base font-extrabold text-primary shadow-card'
            }
          >
            {opened ? t('done') : t('skipSending')}
          </button>
        </div>
      </div>
    </div>
  )
}
