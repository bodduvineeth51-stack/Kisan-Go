import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { useTrans } from './context/LangContext'
import Login from './pages/Login'
import ProfileSetup from './pages/ProfileSetup'
import Dashboard from './pages/Dashboard'
import EarningsScreen from './pages/EarningsScreen'
import TimerScreen from './pages/TimerScreen'

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
  const [activeTab, setActiveTab] = useState('customers') // 'customers' | 'earnings'

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
  if (activeTab === 'earnings') {
    return <EarningsScreen {...sharedProps} />
  }
  return (
    <Dashboard
      {...sharedProps}
      onStartJob={(customer) => setActiveJob({ customer })}
    />
  )
}
