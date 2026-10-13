import { MessageCircle } from 'lucide-react'
import { useTrans } from '../context/LangContext'
import { billLink } from '../lib/whatsapp'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function WhatsAppStatus({ record, customer, onSent, t, lang }) {
  if (record.whatsapp_status === 'sent') {
    return <span className="text-xs font-medium text-green-600">{t('whatsappSent')}</span>
  }
  return (
    <a
      href={billLink(lang, customer, record)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onSent(record)}
      className="inline-flex items-center gap-1 py-1.5 text-xs font-medium text-orange-600 hover:text-orange-700"
    >
      <MessageCircle size={14} strokeWidth={2.2} aria-hidden="true" />
      {t('sendOnWhatsapp')}
    </a>
  )
}

export default function CustomerCard({
  customer,
  records = [],
  onTogglePaid,
  onDelete,
  onEdit,
  onStartJob,
  onBillSent = () => {},
}) {
  const { t, lang } = useTrans()
  const recentRecords = records.slice(0, 3)

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      {/* Top row: name / phone / paid toggle / delete */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
          <p className="truncate font-semibold text-gray-900">{customer.name}</p>
          <p className="text-sm text-gray-500">+91 {customer.phone}</p>
        </button>

        <button
          onClick={onTogglePaid}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
            customer.is_paid
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          {customer.is_paid ? t('paid') : t('unpaid')}
        </button>

        <button
          onClick={onDelete}
          aria-label={`Delete ${customer.name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          ✕
        </button>
      </div>

      {/* Start job button */}
      <div className="px-4 pb-4">
        <button
          onClick={onStartJob}
          className="w-full rounded-xl border border-green-200 bg-green-50 py-3 text-sm font-bold text-green-700 transition-transform active:scale-95 hover:bg-green-100"
        >
          {t('startJob')}
        </button>
      </div>

      {/* Recent work records */}
      {recentRecords.length > 0 && (
        <div className="border-t border-gray-100">
          {recentRecords.map((r) => (
            <div key={r.id} className="border-b border-gray-50 px-4 py-2.5 last:border-b-0">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {fmtDate(r.created_at)}
                  <span className="mx-1 text-gray-300">·</span>
                  {r.vehicle_type}
                  <span className="mx-1 text-gray-300">·</span>
                  {r.total_hours.toFixed(2)} {t('hrShort')}
                </span>
                <span className="text-sm font-semibold text-gray-800">
                  ₹{r.amount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="mt-0.5">
                <WhatsAppStatus record={r} customer={customer} onSent={onBillSent} t={t} lang={lang} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
