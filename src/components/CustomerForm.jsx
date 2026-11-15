import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { localDigits } from '../lib/phone'
import { useTrans } from '../context/LangContext'
import { Sheet, Field, PhoneField, PrimaryButton } from './ui'

const CUSTOMER_NAME_MAX = 20

// Owner add / edit customer sheet. When editing, also offers Delete
// (season-end cleanup) behind a confirm.
export default function CustomerForm({ editing, ownerId, onClose, onSaved, onDeleted }) {
  const { t } = useTrans()
  const [name, setName] = useState(editing?.name ?? '')
  const [phone, setPhone] = useState(editing?.phone ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError(t('enterCustomerName')); return }
    const digits = localDigits(phone)
    if (!digits) { setError(t('validPhoneErr')); return }

    setLoading(true)
    const query = editing
      ? supabase.from('customers').update({ name: name.trim(), phone: digits }).eq('id', editing.id)
      : supabase.from('customers').insert({ owner_id: ownerId, name: name.trim(), phone: digits, is_paid: false })
    const result = await query.select().single()
    setLoading(false)
    if (result.error) {
      // Phase 2: one customer per phone per business (unique index).
      setError(result.error.code === '23505' ? t('customerPhoneExists') : result.error.message)
      return
    }
    onSaved(result.data)
  }

  async function handleDelete() {
    if (!window.confirm(t('deleteConfirm', { name: editing.name }))) return
    setError('')
    setLoading(true)
    const { error } = await supabase.from('customers').delete().eq('id', editing.id)
    setLoading(false)
    if (error) { setError(error.message); return }
    onDeleted?.(editing)
  }

  return (
    <Sheet title={editing ? t('editCustomer') : t('newCustomer')} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field
          id="customer-name"
          label={t('customerNameLabel')}
          placeholder={t('customerNameLabel')}
          value={name}
          maxLength={CUSTOMER_NAME_MAX}
          onChange={(e) => setName(e.target.value.slice(0, CUSTOMER_NAME_MAX))}
          autoFocus
        />
        <PhoneField id="customer-phone" label={t('phoneLabel')} value={phone} onChange={setPhone} />
        {error && <p role="alert" className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
        <PrimaryButton type="submit" disabled={loading}>
          {loading ? t('savingProfile') : t('save')}
        </PrimaryButton>
        {editing && onDeleted && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-base font-bold text-danger disabled:opacity-60"
          >
            <Trash2 size={18} strokeWidth={2.2} aria-hidden="true" />
            {t('deleteCustomer')}
          </button>
        )}
      </form>
    </Sheet>
  )
}
