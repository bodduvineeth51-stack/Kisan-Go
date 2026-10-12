import { Home, Users, Wallet, Menu } from 'lucide-react'
import { useTrans } from '../context/LangContext'

const ALL_TABS = [
  { id: 'home',      labelKey: 'homeTab',      Icon: Home   },
  { id: 'customers', labelKey: 'customersTab', Icon: Users  },
  { id: 'earnings',  labelKey: 'earningsTab',  Icon: Wallet },
  { id: 'more',      labelKey: 'moreTab',      Icon: Menu   },
]

// Floating bottom bar (DESIGN.md → "Floating bottom bar").
// `tabs` limits which tabs show — More is hidden until its screen exists.
export default function BottomNav({ active, onChange, tabs = ['home', 'customers', 'earnings'] }) {
  const { t } = useTrans()
  const visible = ALL_TABS.filter((tab) => tabs.includes(tab.id))

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 mx-auto flex h-[68px] max-w-lg gap-1 rounded-3xl bg-surface p-2 shadow-nav"
    >
      {visible.map(({ id, labelKey, Icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs transition-colors ${
              isActive ? 'bg-mint-100 font-extrabold text-primary' : 'font-semibold text-muted active:bg-mint-50'
            }`}
          >
            <Icon size={22} strokeWidth={isActive ? 2.2 : 2} aria-hidden="true" />
            {t(labelKey)}
          </button>
        )
      })}
    </nav>
  )
}
