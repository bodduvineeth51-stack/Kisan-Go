import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useTrans } from '../context/LangContext'

const CUSTOMER_NAME_MAX = 20

// Add / edit customer bottom sheet.
export default function CustomerForm({ editing, ownerId, onClose, onSaved }) {
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
    const query = editing
      ? supabase.from('customers').update({ name: name.trim(), phone }).eq('id', editing.id)
      : supabase.from('customers').insert({ owner_id: ownerId, name: name.trim(), phone, is_paid: false })
    const result = await query.select().single()
    setLoading(false)
    if (result.error) { setError(result.error.message); return }
    onSaved(result.data)
  }

  const inputBox = 'flex h-14 items-center rounded-[18px] border-2 border-border bg-surface focus-within:border-primary-bright'

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/50" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-lg rounded-t-[26px] bg-bg px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[22px] font-extrabold tracking-[-0.5px]">
            {editing ? t('editCustomer') : t('newCustomer')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-surface text-ink shadow-card"
          >
            <X size={20} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="text-sm font-bold text-muted" htmlFor="cust-name">{t('customerNameLabel')}</label>
          <div className={inputBox}>
            <input
              id="cust-name"
              type="text"
              value={name}
              maxLength={CUSTOMER_NAME_MAX}
              onChange={(e) => setName(e.target.value.slice(0, CUSTOMER_NAME_MAX))}
              autoFocus
              className="h-full w-full rounded-[18px] bg-transparent px-4 text-base font-semibold outline-none"
            />
          </div>

          <label className="text-sm font-bold text-muted" htmlFor="cust-phone">{t('phoneLabel')}</label>
          <div className={inputBox}>
            <span className="pl-4 text-base font-bold text-muted">+91</span>
            <input
              id="cust-phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              className="h-full w-full rounded-[18px] bg-transparent px-2 text-base font-semibold outline-none"
            />
          </div>

          {error && <p className="text-sm font-semibold text-danger">{error}</p>}

          <div className="mt-2 flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-[58px] flex-1 rounded-[18px] bg-surface text-base font-bold text-ink shadow-card"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-[58px] flex-[2] rounded-[18px] bg-primary text-base font-extrabold text-white shadow-green disabled:opacity-60"
            >
              {loading ? t('savingProfile') : t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
