import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { localDigits, formatPhone, whatsappUrl } from '../lib/phone'
import { driverInviteLink } from '../lib/invite'
import BottomNav from '../components/BottomNav'
import AddButton from '../components/AddButton'
import Avatar from '../components/Avatar'
import { useTrans, LangToggle } from '../context/LangContext'

// Owner only. Uses the Phase 2 objects as they are:
//   read:   memberships (policy memberships_owner_read: business_id = auth.uid())
//   add:    add_driver(p_name, p_phone)  → 'invited', becomes 'active' on login
//   link:   after adding, the owner sends the driver an access link from their
//           own WhatsApp (lib/invite.js). The link only pre-fills the login
//           screen; access still comes from the verified phone.
//   revoke: revoke_driver(p_membership_id) → takes effect on the driver's next request
const ADD_ERRORS = {
  phone_is_owner: 'driverPhoneIsOwner',
  phone_in_use: 'driverPhoneInUse',
  invalid_phone: 'validPhoneErr',
  name_required: 'enterDriverName',
}

function errorText(err, t) {
  const key = Object.keys(ADD_ERRORS).find((k) => (err?.message ?? '').includes(k))
  return key ? t(ADD_ERRORS[key]) : (err?.message || t('somethingWrong'))
}

const STATUS_STYLE = {
  invited: 'bg-amber-bg text-amber',
  active: 'bg-mint-100 text-primary',
  revoked: 'bg-due-bg text-due',
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-lg rounded-t-[26px] bg-surface px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold tracking-[-0.3px] text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center text-xl text-muted">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function AddDriverSheet({ onClose, onSaved }) {
  const { t } = useTrans()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError(t('enterDriverName')); return }
    const digits = localDigits(phone)
    if (!digits) { setError(t('validPhoneErr')); return }
    setSaving(true)
    const { data, error } = await supabase.rpc('add_driver', { p_name: name.trim(), p_phone: digits })
    setSaving(false)
    if (error) { setError(errorText(error, t)); return }
    onSaved(data?.[0] ?? { name: name.trim(), phone: digits })
  }

  const input = 'w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-base font-semibold text-ink outline-none focus:border-primary'
  return (
    <Sheet title={t('addDriver')} onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder={t('driverNameLabel')}
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className={input}
        />
        <div className="flex items-center rounded-2xl border border-border bg-surface focus-within:border-primary">
          <span className="pl-4 text-base font-semibold text-muted">+91</span>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={13}
            placeholder="9876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-2xl px-2 py-3.5 text-base font-semibold text-ink outline-none"
          />
        </div>
        <p className="text-sm font-medium text-muted">{t('addDriverHint')}</p>
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-1 min-h-14 rounded-2xl bg-primary text-lg font-extrabold text-white shadow-green disabled:opacity-60"
        >
          {saving ? t('savingProfile') : t('addDriver')}
        </button>
      </form>
    </Sheet>
  )
}

// Send the driver their access link from the owner's own WhatsApp.
function ShareLinkSheet({ driver, ownerName, onClose }) {
  const { t } = useTrans()
  const [copied, setCopied] = useState(false)
  const link = driverInviteLink(driver.phone)
  const message = t('inviteMessage', { name: driver.name, owner: ownerName, link })

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // Clipboard blocked (old browser, no permission): show it to copy by hand
      window.prompt(t('copyLink'), link)
    }
  }

  return (
    <Sheet title={t('sendAccessLinkTitle', { name: driver.name })} onClose={onClose}>
      <p className="text-base font-medium text-muted">{t('sendAccessLinkBody')}</p>
      <p className="mt-3 break-all rounded-2xl bg-mint-50 px-4 py-3 text-sm font-semibold text-ink">{link}</p>
      <a
        href={whatsappUrl(driver.phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-extrabold text-white shadow-green active:scale-[0.98]"
      >
        <MessageCircle size={22} strokeWidth={2.4} aria-hidden="true" />
        {t('sendLinkWhatsApp')}
      </a>
      <button onClick={copy} className="mt-2.5 min-h-12 w-full rounded-2xl border border-border text-base font-bold text-ink">
        {copied ? t('linkCopied') : t('copyLink')}
      </button>
    </Sheet>
  )
}

function RevokeSheet({ driver, onClose, onRevoked }) {
  const { t } = useTrans()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function revoke() {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('revoke_driver', { p_membership_id: driver.id })
    setBusy(false)
    if (error) { setError(errorText(error, t)); return }
    onRevoked()
  }

  return (
    <Sheet title={t('revokeTitle', { name: driver.name })} onClose={onClose}>
      <p className="text-base font-medium text-muted">{t('revokeBody')}</p>
      {error && <p className="mt-3 text-sm font-semibold text-danger">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button onClick={onClose} className="min-h-14 flex-1 rounded-2xl border border-border text-base font-bold text-ink">
          {t('cancel')}
        </button>
        <button
          onClick={revoke}
          disabled={busy}
          className="min-h-14 flex-1 rounded-2xl bg-danger text-base font-extrabold text-white disabled:opacity-60"
        >
          {busy ? t('savingProfile') : t('revokeConfirm')}
        </button>
      </div>
    </Sheet>
  )
}

export default function ManageDrivers({ owner, onSignOut, activeTab, onTabChange }) {
  const { t } = useTrans()
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [revoking, setRevoking] = useState(null)
  const [sharing, setSharing] = useState(null) // driver whose access link is being sent
  const [restoringId, setRestoringId] = useState(null)

  async function fetchDrivers() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('memberships')
      .select('id, name, phone, status, created_at')
      .eq('business_id', owner.id)
      .eq('role', 'driver')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDrivers(data)
  }

  useEffect(() => { fetchDrivers() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // add_driver on a revoked driver restores them (Phase 2 behaviour).
  async function restore(d) {
    setRestoringId(d.id)
    setError('')
    const { error } = await supabase.rpc('add_driver', { p_name: d.name, p_phone: d.phone })
    setRestoringId(null)
    if (error) { setError(errorText(error, t)); return }
    fetchDrivers()
  }

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pb-44 pt-4">
        <div className="flex h-11 items-center justify-between">
          <h1 className="text-[26px] font-extrabold tracking-[-0.8px] text-ink">{t('driversTitle')}</h1>
          <div className="flex items-center gap-2">
            <LangToggle variant="light" />
            <button onClick={onSignOut} className="min-h-11 px-2 text-sm font-bold text-muted">
              {t('signOut')}
            </button>
          </div>
        </div>
        <p className="text-sm font-medium text-muted">{t('driversSub')}</p>

        {error && (
          <div className="rounded-[18px] bg-surface px-4 py-3 text-center shadow-card">
            <p className="text-sm font-semibold text-danger">{error}</p>
            <button onClick={fetchDrivers} className="mt-2 min-h-11 text-sm font-bold text-primary underline">
              {t('retry')}
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-mint-200 border-t-primary" />
          </div>
        )}

        {!loading && !error && drivers.length === 0 && (
          <div className="rounded-[18px] bg-surface px-4 py-8 text-center shadow-card">
            <p className="text-base font-bold text-ink">{t('noDrivers')}</p>
            <p className="mt-1 text-sm font-medium text-muted">{t('noDriversSub')}</p>
          </div>
        )}

        {!loading && drivers.map((d) => (
          <div key={d.id} className="rounded-[18px] bg-surface px-3.5 py-3 shadow-card">
            <div className="flex items-center gap-3">
              <Avatar id={d.id} name={d.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-ink">{d.name}</p>
                <p className="text-[13px] font-medium text-muted">{formatPhone(d.phone)}</p>
                <span className={`mt-1 inline-block rounded-lg px-2 py-px text-xs font-bold ${STATUS_STYLE[d.status]}`}>
                  {t(`status_${d.status}`)}
                </span>
              </div>
              {d.status === 'revoked' ? (
                <button
                  onClick={() => restore(d)}
                  disabled={restoringId === d.id}
                  className="min-h-11 rounded-2xl bg-mint-100 px-3.5 text-sm font-bold text-primary disabled:opacity-60"
                >
                  {t('restoreDriver')}
                </button>
              ) : (
                <button
                  onClick={() => setRevoking(d)}
                  className="min-h-11 rounded-2xl border border-border px-3.5 text-sm font-bold text-danger"
                >
                  {t('revokeDriver')}
                </button>
              )}
            </div>
            {d.status === 'invited' && (
              <button
                onClick={() => setSharing(d)}
                className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-mint-100 text-sm font-extrabold text-primary active:scale-[0.98]"
              >
                <MessageCircle size={18} strokeWidth={2.4} aria-hidden="true" />
                {t('sendLinkWhatsApp')}
              </button>
            )}
          </div>
        ))}
      </div>

      <AddButton onClick={() => setShowAdd(true)} label={t('addDriverShort')} ariaLabel={t('addDriver')} />

      {showAdd && (
        <AddDriverSheet
          onClose={() => setShowAdd(false)}
          onSaved={(driver) => { setShowAdd(false); setSharing(driver); fetchDrivers() }}
        />
      )}
      {sharing && (
        <ShareLinkSheet driver={sharing} ownerName={owner.name} onClose={() => setSharing(null)} />
      )}
      {revoking && (
        <RevokeSheet
          driver={revoking}
          onClose={() => setRevoking(null)}
          onRevoked={() => { setRevoking(null); fetchDrivers() }}
        />
      )}

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}
