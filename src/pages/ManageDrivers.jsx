import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { localDigits, formatPhone, whatsappUrl } from '../lib/phone'
import { driverInviteLink } from '../lib/invite'
import BottomNav from '../components/BottomNav'
import AddButton from '../components/AddButton'
import Avatar from '../components/Avatar'
import { useTrans, LangToggle } from '../context/LangContext'
import { Sheet, Field, PhoneField, PrimaryButton, PageHeader, Spinner, ErrorCard, EmptyCard, Chip } from '../components/ui'

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

const STATUS_TONE = { invited: 'amber', active: 'mint', revoked: 'due' }

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

  return (
    <Sheet title={t('addDriver')} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field
          id="driver-name"
          label={t('driverNameLabel')}
          placeholder={t('driverNameLabel')}
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <PhoneField id="driver-phone" label={t('driverPhoneLabel')} hint={t('addDriverHint')} value={phone} onChange={setPhone} />
        {error && <p role="alert" className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
        <PrimaryButton type="submit" disabled={saving}>
          {saving ? t('savingProfile') : t('addDriver')}
        </PrimaryButton>
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

  if (!link) return (
    <Sheet title={t('sendAccessLinkTitle', { name: driver.name })} onClose={onClose}>
      <p role="alert" className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-due">{t('inviteUrlUnavailable')}</p>
    </Sheet>
  )

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
        className="mt-4 flex min-h-16 items-center justify-center gap-2.5 rounded-[20px] bg-primary text-xl font-extrabold text-white shadow-green active:scale-[0.98]"
      >
        <MessageCircle size={22} strokeWidth={2.4} aria-hidden="true" />
        {t('sendLinkWhatsApp')}
      </a>
      <button onClick={copy} className="mt-2.5 min-h-[52px] w-full rounded-[18px] bg-mint-50 text-base font-bold text-primary">
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
      {error && <p role="alert" className="mt-3 rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button onClick={onClose} className="min-h-[58px] flex-1 rounded-[18px] bg-mint-50 text-base font-bold text-ink">
          {t('cancel')}
        </button>
        <button
          onClick={revoke}
          disabled={busy}
          className="min-h-[58px] flex-1 rounded-[18px] bg-danger text-base font-extrabold text-white shadow-danger disabled:opacity-60"
        >
          {busy ? t('savingProfile') : t('revokeConfirm')}
        </button>
      </div>
    </Sheet>
  )
}

export default function ManageDrivers({ owner, activeTab, onTabChange }) {
  const { t } = useTrans()
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [revoking, setRevoking] = useState(null)
  const [sharing, setSharing] = useState(null) // driver whose access link is being sent
  const [restoringId, setRestoringId] = useState(null)

  async function fetchDrivers({ quiet = false } = {}) {
    if (!quiet) setLoading(true)
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

  // The owner leaves the app to send the link on WhatsApp. When they come
  // back, refresh quietly so a driver who has logged in shows as Active.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') fetchDrivers({ quiet: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        <PageHeader
          title={t('driversTab')}
          chip={loading ? null : t('driversCount', { n: drivers.filter((d) => d.status !== 'revoked').length })}
          right={<LangToggle />}
        />
        <p className="text-sm font-medium text-muted">{t('driversSub')}</p>

        {error && <ErrorCard message={error} onRetry={() => fetchDrivers()} />}
        {loading && <Spinner />}
        {!loading && !error && drivers.length === 0 && <EmptyCard title={t('noDrivers')} sub={t('noDriversSub')} />}

        {!loading && drivers.map((d) => (
          <div key={d.id} className="rounded-[18px] bg-surface px-3.5 py-2.5 shadow-card">
            <div className="flex items-center gap-3">
              <Avatar id={d.id} name={d.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-ink">{d.name}</p>
                <p className="text-[13px] font-medium text-muted">{formatPhone(d.phone)}</p>
                <Chip small tone={STATUS_TONE[d.status]} className="mt-1">{t(`status_${d.status}`)}</Chip>
              </div>
              {d.status === 'revoked' ? (
                <button
                  onClick={() => restore(d)}
                  disabled={restoringId === d.id}
                  className="min-h-11 rounded-[14px] bg-mint-100 px-3.5 text-sm font-extrabold text-primary disabled:opacity-60"
                >
                  {t('restoreDriver')}
                </button>
              ) : (
                <button
                  onClick={() => setRevoking(d)}
                  className="min-h-11 rounded-[14px] bg-due-bg px-3.5 text-sm font-extrabold text-due"
                >
                  {t('revokeDriver')}
                </button>
              )}
            </div>
            {d.status !== 'revoked' && (
              <button
                onClick={() => setSharing(d)}
                className="mt-2.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-mint-50 text-sm font-extrabold text-primary active:scale-[0.98]"
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
          onSaved={(driver) => { setShowAdd(false); setSharing(driver); fetchDrivers({ quiet: true }) }}
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
