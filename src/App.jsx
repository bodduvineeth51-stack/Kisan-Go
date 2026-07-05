import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Login from './pages/Login'
import ProfileSetup from './pages/ProfileSetup'

function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center text-gray-500">
      Loading…
    </div>
  )
}

function Dashboard({ owner, onSignOut }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">
        Welcome, {owner.name}
      </h1>
      <ul className="text-sm text-gray-600">
        {owner.vehicle_rates.map((v) => (
          <li key={v.type}>
            {v.type} — ₹{v.hourly_rate}/hr
          </li>
        ))}
      </ul>
      <button
        onClick={onSignOut}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
      >
        Sign out
      </button>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = signed out
  const [owner, setOwner] = useState(undefined)

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
  return <Dashboard owner={owner} onSignOut={() => supabase.auth.signOut()} />
}
