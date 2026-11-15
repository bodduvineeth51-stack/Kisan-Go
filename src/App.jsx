import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Login from './pages/Login'
import ProfileSetup from './pages/ProfileSetup'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import EarningsScreen from './pages/EarningsScreen'
import TimerScreen from './pages/TimerScreen'
import ManageDrivers from './pages/ManageDrivers'
import OwnerProfile from './pages/OwnerProfile'
import DriverApp from './pages/driver/DriverApp'
import { loadMyRole, setActingAs, savedMode, saveMode } from './lib/roles'
import { readInvitePhone, clearInviteParam } from './lib/invite'
import { localDigits, formatPhone } from './lib/phone'
import CustomerPage from './pages/CustomerPage'
import { LogoMark, Wordmark } from './components/ui'
import { useTrans } from './context/LangContext'

function InstallBanner() {
  const { t } = useTrans()
  const [prompt, setPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    function handler(e) {
      e.preventDefault()
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!prompt || dismissed) return null

  async function install() {
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setPrompt(null)
      setDismissed(true)
    }
  }

  return (
    <div className="fixed inset-x-3 top-[calc(12px+env(safe-area-inset-top))] z-50 mx-auto flex max-w-lg items-center gap-3 rounded-3xl bg-surface p-3 shadow-nav">
      <LogoMark size={40} />
      <p className="min-w-0 flex-1 text-sm font-bold text-ink">{t('installTitle')}</p>
      <button onClick={() => setDismissed(true)} className="min-h-11 shrink-0 px-2 text-sm font-bold text-muted">
        {t('notNow')}
      </button>
      <button onClick={install} className="min-h-11 shrink-0 rounded-2xl bg-primary px-4 text-sm font-extrabold text-white shadow-green">
        {t('install')}
      </button>
    </div>
  )
}

function Loading() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-mint-100">
      <div className="absolute -right-[60px] -top-[60px] h-[220px] w-[220px] rounded-full bg-mint-200" />
      <div className="absolute -left-[30px] bottom-[20%] h-[90px] w-[90px] rounded-full bg-lime opacity-50" />
      <div className="relative flex flex-col items-center gap-4 text-center">
        <LogoMark size={72} />
        <Wordmark className="text-[44px] leading-none tracking-[-1.5px]" />
        <p className="text-base font-semibold text-mint-ink">మీ వాహనం లెక్కలు, మీ ఫోన్‌లో.</p>
      </div>
      <div role="status" aria-label="Loading" className="relative h-8 w-8 animate-spin rounded-full border-4 border-mint-200 border-t-primary" />
    </div>
  )
}

const PRIMARY = 'min-h-[58px] rounded-[18px] bg-primary px-4 text-lg font-extrabold text-white shadow-green active:scale-[0.98]'
const SECONDARY = 'min-h-[52px] rounded-[18px] bg-mint-50 px-4 text-base font-bold text-primary'

function CenteredMessage({ title, body, actions }) {
  return (
    <div className="flex min-h-svh items-center justify-center px-5">
      <div className="flex w-full max-w-sm flex-col items-center rounded-[26px] bg-surface p-7 text-center shadow-raised">
        <LogoMark size={52} className="mb-4" />
        <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.4px] text-ink">{title}</h1>
        {body && <p className="mt-2 text-base font-medium text-muted">{body}</p>}
        <div className="mt-6 flex w-full flex-col gap-2.5">{actions}</div>
      </div>
    </div>
  )
}

// Shown to a driver whose owner removed them, on login or mid-session.
// Someone who also owns a business can go back to it.
function AccessRemoved({ onSignOut, onOpenOwner }) {
  const { t } = useTrans()
  return (
    <CenteredMessage
      title={t('accessRemovedTitle')}
      body={t('accessRemovedBody')}
      actions={<>
        {onOpenOwner && <button onClick={onOpenOwner} className={PRIMARY}>{t('openMyBusiness')}</button>}
        <button onClick={onSignOut} className={onOpenOwner ? SECONDARY : PRIMARY}>{t('signOut')}</button>
      </>}
    />
  )
}

// An owner who is also a driver for another business, first time on this phone.
function RoleChooser({ business, onChoose }) {
  const { t } = useTrans()
  return (
    <CenteredMessage
      title={t('chooseRoleTitle')}
      body={t('chooseRoleBody', { business })}
      actions={<>
        <button onClick={() => onChoose('owner')} className={PRIMARY}>{t('openAsOwner')}</button>
        <button onClick={() => onChoose('driver')} className={SECONDARY}>{t('openAsDriver', { business })}</button>
      </>}
    />
  )
}

// Someone opened a driver access link and logged in, but the database has no
// driver access for their number (owner typed a different number, or they
// logged in with another one). Without this they would land on the owner
// sign-up form and could register as an owner by mistake.
function InviteNotFound({ phone, invitedPhone, onRetry, onSignOut, onOwnerSignup }) {
  const { t } = useTrans()
  const mismatch = Boolean(phone) && phone !== invitedPhone
  const primary = PRIMARY
  const secondary = SECONDARY
  const retryBtn = (cls) => <button onClick={onRetry} className={cls}>{t('checkAgain')}</button>
  const signOutBtn = (cls) => <button onClick={onSignOut} className={cls}>{t('signOut')}</button>
  return (
    <CenteredMessage
      title={t('inviteNotFoundTitle')}
      body={mismatch
        ? t('inviteNotFoundMismatch', { invited: formatPhone(invitedPhone), phone: formatPhone(phone) })
        : t('inviteNotFoundAsk', { phone: formatPhone(invitedPhone) })}
      actions={
        <>
          {/* Wrong number: checking again can't help, logging out can. */}
          {mismatch ? signOutBtn(primary) : retryBtn(primary)}
          {mismatch ? retryBtn(secondary) : signOutBtn(secondary)}
          <button onClick={onOwnerSignup} className="min-h-11 text-sm font-bold text-muted underline">
            {t('iAmOwner')}
          </button>
        </>
      }
    />
  )
}

function RoleError({ onRetry, onSignOut }) {
  const { t } = useTrans()
  return (
    <CenteredMessage
      title={t('roleLoadFailed')}
      actions={
        <>
          <button onClick={onRetry} className={PRIMARY}>{t('retry')}</button>
          <button onClick={onSignOut} className="min-h-12 text-base font-bold text-muted">
            {t('signOut')}
          </button>
        </>
      }
    />
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [authError, setAuthError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let authEventReceived = false
    setAuthError(false)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventReceived = true
      if (active) { setSession(next); setAuthError(false) }
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return
      if (error) setAuthError(true)
      else setSession(data.session)
    }).catch(() => { if (active && !authEventReceived) setAuthError(true) })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [attempt])

  if (authError) return <RoleError onRetry={() => setAttempt(n => n + 1)} onSignOut={() => supabase.auth.signOut()} />
  if (session === undefined) return <Loading />
  if (session === null) return <Login />
  // A different account always gets fresh navigation and role state.
  return <AccountApp key={session.user.id} session={session} />
}

function AccountApp({ session }) {
  // undefined = loading, null = no business yet, { error } = failed,
  // { role: 'owner', owner } or { role: 'driver', status, … } from get_my_role
  const [me, setMe] = useState(undefined)
  const [invitedPhone, setInvitedPhone] = useState(readInvitePhone)
  const roleRequest = useRef(0)
  const userId = session.user.id
  // Opening a driver link with your own number means "open the driver side",
  // even for someone who also owns a business. Otherwise use the side they
  // last chose on this phone (owner by default).
  const [fromInvite] = useState(() => readInvitePhone() === localDigits(session.user.phone))
  const preferred = useRef(fromInvite ? 'driver' : savedMode(userId) ?? 'owner')
  const [modeChosen, setModeChosen] = useState(() => fromInvite || savedMode(userId) !== null)
  useEffect(() => { if (fromInvite) saveMode(userId, 'driver') }, [fromInvite, userId])
  const [accessRemoved, setAccessRemoved] = useState(false)
  const [ownerSignup, setOwnerSignup] = useState(false) // came by driver link, chose owner sign-up
  const [activeJob, setActiveJob] = useState(null)  // { customer } | null
  const [activeTab, setActiveTab] = useState('home') // 'home' | 'customers' | 'earnings' | 'drivers' | 'profile'
  const [tabOptions, setTabOptions] = useState({})   // e.g. { filter: 'due' } for Customers
  const [openCustomerId, setOpenCustomerId] = useState(null) // owner's Customer page

  const mismatch = Boolean(invitedPhone && localDigits(session.user.phone) !== invitedPhone)

  const dismissInvite = useCallback(() => {
    clearInviteParam()
    setInvitedPhone(null)
  }, [])

  const resolveRole = useCallback(async () => {
    const request = ++roleRequest.current
    setMe(undefined)
    setAccessRemoved(false)
    try {
      const role = await loadMyRole(preferred.current)
      if (request !== roleRequest.current) return
      setActingAs(role?.role)
      if (role?.role === 'owner') {
        const { data, error } = await supabase.from('owners').select('*').eq('id', role.business_id).maybeSingle()
        if (error) throw error
        if (request !== roleRequest.current) return
        setMe(data ? { role: 'owner', owner: data, other: role.other } : null)
        if (data) dismissInvite()
      } else {
        setMe(role)
        if (role) dismissInvite()
      }
    } catch (err) {
      if (request !== roleRequest.current) return
      console.error('[app] could not load role:', err)
      setMe({ error: err })
    }
  }, [dismissInvite])

  useEffect(() => {
    if (mismatch) return
    resolveRole()
    return () => { roleRequest.current += 1 }
  }, [mismatch, resolveRole])

  const signOut = () => supabase.auth.signOut()

  // Owner who is also a driver: open the other side and remember the choice.
  function switchRole(mode) {
    preferred.current = mode
    saveMode(userId, mode)
    setModeChosen(true)
    setActiveJob(null)
    setOpenCustomerId(null)
    setTabOptions({})
    setActiveTab('home')
    resolveRole()
  }

  if (mismatch) return <InviteAccountMismatch phone={session.user.phone} invitedPhone={invitedPhone} onSignOut={signOut} onContinue={dismissInvite} />
  if (me === undefined) return <Loading />
  if (me?.error) return <RoleError onRetry={resolveRole} onSignOut={signOut} />

  const roles = me ? [me, me.other].filter(Boolean) : []
  const driverSide = roles.find(r => r.role === 'driver' && r.status === 'active')
  const hasOwnerSide = roles.some(r => r.role === 'owner')
  if (driverSide && hasOwnerSide && !modeChosen) {
    return <RoleChooser business={driverSide.business_name} onChoose={switchRole} />
  }

  if (me?.role === 'driver') {
    const openOwner = hasOwnerSide ? () => switchRole('owner') : undefined
    if (me.status !== 'active' || accessRemoved) return <AccessRemoved onSignOut={signOut} onOpenOwner={openOwner} />
    return (
      <DriverApp
        me={me}
        phone={session.user.phone}
        onSignOut={signOut}
        onAccessRemoved={() => setAccessRemoved(true)}
        onSwitchToOwner={openOwner}
      />
    )
  }

  if (me === null) {
    // Arrived by a driver access link but no driver access was found.
    if (invitedPhone && !ownerSignup) {
      return (
        <InviteNotFound
          phone={localDigits(session.user.phone)}
          invitedPhone={invitedPhone}
          onRetry={resolveRole}
          onSignOut={signOut}
          onOwnerSignup={() => setOwnerSignup(true)}
        />
      )
    }
    return (
      <ProfileSetup
        user={session.user}
        onComplete={resolveRole}
        onBack={signOut}
      />
    )
  }

  const owner = me.owner
  function goTab(tab, options = {}) {
    setOpenCustomerId(null)
    setTabOptions(options)
    setActiveTab(tab)
  }

  if (activeJob) {
    return (
      <TimerScreen
        customer={activeJob.customer}
        vehicleRates={owner.vehicle_rates}
        onComplete={() => { setActiveJob(null); goTab('home') }}
        onBack={() => setActiveJob(null)}
      />
    )
  }
  if (openCustomerId) {
    return (
      <CustomerPage
        owner={owner}
        customerId={openCustomerId}
        onBack={() => setOpenCustomerId(null)}
        onStartJob={(customer) => setActiveJob({ customer })}
        onDeleted={() => setOpenCustomerId(null)}
      />
    )
  }
  const sharedProps = {
    owner,
    onSignOut: signOut,
    activeTab,
    onTabChange: goTab,
    onOpenCustomer: (customer) => setOpenCustomerId(customer.id),
  }
  return (
    <>
      {activeTab === 'home' && <Home {...sharedProps} />}
      {activeTab === 'earnings' && <EarningsScreen {...sharedProps} />}
      {activeTab === 'customers' && <Dashboard key={tabOptions.filter ?? 'all'} {...sharedProps} initialFilter={tabOptions.filter} />}
      {activeTab === 'drivers' && <ManageDrivers {...sharedProps} />}
      {activeTab === 'profile' && (
        <OwnerProfile
          {...sharedProps}
          onSaved={owner => setMe(prev => ({ ...prev, role: 'owner', owner }))}
          driverFor={driverSide?.business_name}
          onSwitchToDriver={driverSide ? () => switchRole('driver') : undefined}
        />
      )}
      <InstallBanner />
    </>
  )
}

function InviteAccountMismatch({ phone, invitedPhone, onSignOut, onContinue }) {
  const { t } = useTrans()
  return <CenteredMessage title={t('inviteWrongAccount')}
    body={t('inviteNotFoundMismatch', { invited: formatPhone(invitedPhone), phone: formatPhone(phone) })}
    actions={<>
      <button onClick={onSignOut} className={PRIMARY}>{t('switchAccount')}</button>
      <button onClick={onContinue} className={SECONDARY}>{t('continueMyAccount')}</button>
    </>} />
}
