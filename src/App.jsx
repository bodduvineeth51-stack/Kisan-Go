import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Login from './pages/Login'
import ProfileSetup from './pages/ProfileSetup'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import EarningsScreen from './pages/EarningsScreen'
import TimerScreen from './pages/TimerScreen'
import ManageDrivers from './pages/ManageDrivers'
import DriverApp from './pages/driver/DriverApp'
import { loadMyRole } from './lib/roles'
import { useTrans } from './context/LangContext'

function InstallBanner() {
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
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-green-700 px-4 py-3 shadow-lg">
      <p className="text-sm font-medium text-white">Install Kisan Go on your phone</p>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => setDismissed(true)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-green-200 hover:text-white"
        >
          Not now
        </button>
        <button
          onClick={install}
          className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-50"
        >
          Install
        </button>
      </div>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-green-600">
      <div className="text-center">
        <h1 className="text-4xl font-black tracking-tight text-white">Kisan Go</h1>
        <p className="mt-1 text-sm text-green-200">కిసాన్ గో</p>
      </div>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-400 border-t-white" />
    </div>
  )
}

function CenteredMessage({ title, body, actions }) {
  return (
    <div className="flex min-h-svh items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-[26px] bg-surface p-7 text-center shadow-card">
        <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.4px] text-ink">{title}</h1>
        {body && <p className="mt-2 text-base font-medium text-muted">{body}</p>}
        <div className="mt-6 flex flex-col gap-2.5">{actions}</div>
      </div>
    </div>
  )
}

// Shown to a driver whose owner removed them, on login or mid-session.
function AccessRemoved({ onSignOut }) {
  const { t } = useTrans()
  return (
    <CenteredMessage
      title={t('accessRemovedTitle')}
      body={t('accessRemovedBody')}
      actions={
        <button onClick={onSignOut} className="min-h-14 rounded-2xl bg-primary text-lg font-extrabold text-white shadow-green">
          {t('signOut')}
        </button>
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
          <button onClick={onRetry} className="min-h-14 rounded-2xl bg-primary text-lg font-extrabold text-white shadow-green">
            {t('retry')}
          </button>
          <button onClick={onSignOut} className="min-h-12 text-base font-bold text-muted">
            {t('signOut')}
          </button>
        </>
      }
    />
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = signed out
  // undefined = loading, null = no business yet, { error } = failed,
  // { role: 'owner', owner } or { role: 'driver', status, … } from get_my_role
  const [me, setMe] = useState(undefined)
  const [accessRemoved, setAccessRemoved] = useState(false)
  const [activeJob, setActiveJob] = useState(null)  // { customer } | null
  const [activeTab, setActiveTab] = useState('home') // 'home' | 'customers' | 'earnings' | 'drivers'

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  // Re-run only when the logged-in user changes, not on every token refresh,
  // so an hourly refresh never throws away a running timer.
  const sessionLoaded = session !== undefined
  const userId = session?.user?.id

  const resolveRole = useCallback(async () => {
    setMe(undefined)
    setAccessRemoved(false)
    try {
      const role = await loadMyRole()
      if (role?.role === 'owner') {
        const { data, error } = await supabase.from('owners').select('*').eq('id', role.business_id).maybeSingle()
        if (error) throw error
        setMe(data ? { role: 'owner', owner: data } : null)
      } else {
        setMe(role)
      }
    } catch (err) {
      console.error('[app] could not load role:', err)
      setMe({ error: err })
    }
  }, [])

  useEffect(() => {
    if (!sessionLoaded) return
    if (!userId) {
      setMe(null)
      setActiveJob(null)
      setActiveTab('home')
      return
    }
    resolveRole()
  }, [sessionLoaded, userId, resolveRole])

  const signOut = () => supabase.auth.signOut()

  if (session === undefined) return <Loading />
  if (session === null) return <Login />
  if (me === undefined) return <Loading />
  if (me?.error) return <RoleError onRetry={resolveRole} onSignOut={signOut} />

  if (me?.role === 'driver') {
    if (me.status !== 'active' || accessRemoved) return <AccessRemoved onSignOut={signOut} />
    return <DriverApp me={me} onSignOut={signOut} onAccessRemoved={() => setAccessRemoved(true)} />
  }

  if (me === null) {
    return (
      <ProfileSetup
        user={session.user}
        onComplete={resolveRole}
        onBack={signOut}
      />
    )
  }

  const owner = me.owner
  if (activeJob) {
    return (
      <TimerScreen
        customer={activeJob.customer}
        vehicleRates={owner.vehicle_rates}
        onComplete={() => setActiveJob(null)}
        onBack={() => setActiveJob(null)}
      />
    )
  }
  const sharedProps = {
    owner,
    onSignOut: signOut,
    activeTab,
    onTabChange: setActiveTab,
  }
  return (
    <>
      {activeTab === 'home' && <Home {...sharedProps} />}
      {activeTab === 'earnings' && <EarningsScreen {...sharedProps} />}
      {activeTab === 'customers' && (
        <Dashboard {...sharedProps} onStartJob={(customer) => setActiveJob({ customer })} />
      )}
      {activeTab === 'drivers' && <ManageDrivers {...sharedProps} />}
      <InstallBanner />
    </>
  )
}
