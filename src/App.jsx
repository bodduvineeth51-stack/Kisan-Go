import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { LogoMark } from './components/Logo'
import Login from './pages/Login'
import ProfileSetup from './pages/ProfileSetup'
import Home from './pages/Home'
import Customers from './pages/Customers'
import CustomerPage from './pages/CustomerPage'
import EarningsScreen from './pages/EarningsScreen'
import MoreScreen from './pages/MoreScreen'
import TimerScreen from './pages/TimerScreen'
import BillSent from './pages/BillSent'

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
    <div className="fixed inset-x-3 top-[calc(12px+env(safe-area-inset-top))] z-50 mx-auto flex max-w-lg items-center gap-3 rounded-[20px] bg-ink px-4 py-2.5 shadow-nav">
      <LogoMark size={32} />
      <p className="flex-1 text-sm font-bold text-white">Install Kisan Go on your phone</p>
      <button onClick={() => setDismissed(true)} className="min-h-11 px-2 text-sm font-semibold text-mint-200">
        Not now
      </button>
      <button onClick={install} className="h-11 rounded-2xl bg-lime px-4 text-sm font-extrabold text-ink">
        Install
      </button>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-primary">
      <LogoMark size={72} />
      <div className="text-center">
        <h1 className="text-[40px] font-extrabold leading-none tracking-[-1.5px] text-white">
          Kisan<span className="text-lime">Go</span>
        </h1>
        <p className="mt-2 text-base font-medium text-mint-100">కిసాన్ గో</p>
      </div>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-lime" />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = signed out
  const [owner, setOwner] = useState(undefined)
  // Full-screen layer over the tabs: { name: 'customer' | 'timer' | 'bill', customer, record? } | null
  const [view, setView] = useState(null)
  const [activeTab, setActiveTab] = useState('home') // 'home' | 'customers' | 'earnings' | 'more'
  const [customerFilter, setCustomerFilter] = useState('all')

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
  if (view?.name === 'timer') {
    return (
      <TimerScreen
        customer={view.customer}
        owner={owner}
        onComplete={(record) => setView({ name: 'bill', customer: view.customer, record })}
        onBack={() => setView({ name: 'customer', customer: view.customer })}
        onChangeCustomer={() => { setView(null); setCustomerFilter('all'); setActiveTab('customers') }}
      />
    )
  }
  if (view?.name === 'bill') {
    return (
      <BillSent
        record={view.record}
        customer={view.customer}
        onDone={() => { setView(null); setActiveTab('home') }}
      />
    )
  }
  if (view?.name === 'customer') {
    return (
      <CustomerPage
        key={view.customer.id}
        owner={owner}
        customer={view.customer}
        onBack={() => setView(null)}
        onStartWork={(customer) => setView({ name: 'timer', customer })}
      />
    )
  }
  const sharedProps = {
    owner,
    onSignOut: () => supabase.auth.signOut(),
    activeTab,
    onTabChange: (tab, opts = {}) => {
      setCustomerFilter(opts.filter ?? 'all')
      setActiveTab(tab)
    },
    onOpenCustomer: (customer) => setView({ name: 'customer', customer }),
  }
  return (
    <>
      {activeTab === 'home' && <Home {...sharedProps} />}
      {activeTab === 'earnings' && <EarningsScreen {...sharedProps} />}
      {activeTab === 'more' && <MoreScreen {...sharedProps} />}
      {activeTab === 'customers' && <Customers {...sharedProps} initialFilter={customerFilter} />}
      <InstallBanner />
    </>
  )
}
