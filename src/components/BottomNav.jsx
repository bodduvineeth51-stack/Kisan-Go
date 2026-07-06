import { useTrans } from '../context/LangContext'

export default function BottomNav({ active, onChange }) {
  const { t } = useTrans()
  const tabs = [
    { id: 'customers', label: t('customersTab'), icon: '👥' },
    { id: 'earnings',  label: t('earningsTab'),  icon: '₹'  },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-gray-200 bg-white">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
            active === tab.id ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
