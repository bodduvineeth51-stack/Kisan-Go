import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Login from './pages/Login'
import ProfileSetup from './pages/ProfileSetup'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import EarningsScreen from './pages/EarningsScreen'
import TimerScreen from './pages/TimerScreen'

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

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = signed out
  const [owner, setOwner] = useState(undefined)
  const [activeJob, setActiveJob] = useState(null)  // { customer } | null
  const [activeTab, setActiveTab] = useState('home') // 'home' | 'customers' | 'earnings'

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  function fetchOwner(userId) {
    return supabase
      .from('owners')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => setOwner(data ?? null))
  }

  useEffect(() => {
    if (!session) {
      setOwner(session === null ? null : undefined)
      return
    }
    setOwner(undefined)
    fetchOwner(session.user.id)
  }, [session])

  if (session === undefined) return <Loading />
  if (session === null) return <Login />
  if (owner === undefined) return <Loading />
  if (owner === null) {
    return (
      <ProfileSetup
        user={session.user}
        onComplete={() => fetchOwner(session.user.id)}
        onBack={() => supabase.auth.signOut()}
      />
    )
  }
  if (activeJob) {
    return (
      <TimerScreen
        customer={activeJob.customer}
        owner={owner}
        onComplete={() => setActiveJob(null)}
        onBack={() => setActiveJob(null)}
      />
    )
  }
  const sharedProps = {
    owner,
    onSignOut: () => supabase.auth.signOut(),
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
      <InstallBanner />
    </>
  )
}
