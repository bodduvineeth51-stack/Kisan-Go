import { useState } from 'react'
import TimerScreen from '../TimerScreen'
import DriverCustomers from './DriverCustomers'
import MyJobs from './MyJobs'

// Everything an ACTIVE driver can reach. There is deliberately no route here to
// the owner's Home, Earnings, Manage Drivers, paid/unpaid, edit or delete.
// All data comes from Phase 2 driver RPCs; drivers have no table policies.
//
// me = get_my_role() row: { business_name, name, vehicle_rates, … }
export default function DriverApp({ me, onSignOut, onAccessRemoved }) {
  const [tab, setTab] = useState('customers') // 'customers' | 'myjobs'
  const [activeJob, setActiveJob] = useState(null) // { customer }

  if (activeJob) {
    return (
      <TimerScreen
        role="driver"
        customer={activeJob.customer}
        vehicleRates={me.vehicle_rates ?? []}
        onComplete={() => { setActiveJob(null); setTab('myjobs') }}
        onBack={() => setActiveJob(null)}
        onAccessRemoved={onAccessRemoved}
      />
    )
  }

  const shared = { me, onSignOut, onAccessRemoved, activeTab: tab, onTabChange: setTab }
  if (tab === 'myjobs') return <MyJobs {...shared} />
  return <DriverCustomers {...shared} onStartJob={(customer) => setActiveJob({ customer })} />
}
