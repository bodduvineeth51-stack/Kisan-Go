import { useCallback, useEffect, useRef, useState } from 'react'
import TimerScreen from '../TimerScreen'
import DriverCustomers from './DriverCustomers'
import MyJobs from './MyJobs'
import DriverProfile from './DriverProfile'
import DriverDashboard from './DriverDashboard'
import { loadMyRole } from '../../lib/roles'
import { useTrans } from '../../context/LangContext'

// Everything an ACTIVE driver can reach. There is deliberately no route here to
// the owner's Home, Earnings, Manage Drivers, paid/unpaid, edit or delete.
// All data comes from Phase 2 driver RPCs; drivers have no table policies.
//
// me = get_my_role() row: { business_name, name, vehicle_rates, … }
// phone = the driver's verified login number (from the session)
export default function DriverApp({ me, phone, onSignOut, onAccessRemoved, onSwitchToOwner }) {
  const { t } = useTrans()
  const [tab, setTab] = useState('home')
  const [activeJob, setActiveJob] = useState(null) // { customer }
  const [profile, setProfile] = useState(me)
  const [error, setError] = useState(false)
  const [starting, setStarting] = useState(false)
  const alive = useRef(true)
  const accessRemoved = useRef(onAccessRemoved)
  accessRemoved.current = onAccessRemoved
  const removed = useCallback(() => accessRemoved.current(), [])
  const refresh = useCallback(async () => {
    try {
      const next = await loadMyRole()
      if (!alive.current) return null
      if (!next || next.role !== 'driver' || next.status !== 'active' || next.business_id !== me.business_id) {
        removed()
        return null
      }
      setProfile(next)
      setError(false)
      return next
    } catch {
      if (alive.current) setError(true)
      return null
    }
  }, [me.business_id, removed])

  useEffect(() => {
    alive.current = true
    const check = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', check)
    const timer = setInterval(check, 30000)
    return () => { alive.current = false; document.removeEventListener('visibilitychange', check); clearInterval(timer) }
  }, [refresh])

  async function startJob(customer) {
    if (starting) return
    setStarting(true)
    const next = await refresh()
    if (next && alive.current) setActiveJob({ customer })
    if (alive.current) setStarting(false)
  }

  if (activeJob) {
    return (
      <TimerScreen
        role="driver"
        customer={activeJob.customer}
        vehicleRates={profile.vehicle_rates ?? []}
        onComplete={() => { setActiveJob(null); setTab('myjobs') }}
        onBack={() => setActiveJob(null)}
        onAccessRemoved={removed}
      />
    )
  }

  const shared = { me: profile, onSignOut, onAccessRemoved: removed, activeTab: tab, onTabChange: setTab }
  return <>
    {error && <div role="alert" className="bg-due-bg p-3 text-center text-sm font-semibold text-due">{t('driverRefreshFailed')} <button onClick={refresh} className="min-h-11 px-2 underline">{t('retry')}</button></div>}
    {starting && <p role="status" className="bg-mint-100 p-3 text-center font-semibold text-primary">{t('loading')}</p>}
    {tab === 'home' && <DriverDashboard {...shared} />}
    {tab === 'myjobs' && <MyJobs {...shared} />}
    {tab === 'profile' && <DriverProfile {...shared} phone={phone} onSwitchToOwner={onSwitchToOwner} />}
    {tab === 'customers' && <DriverCustomers {...shared} onStartJob={startJob} />}
  </>
}
