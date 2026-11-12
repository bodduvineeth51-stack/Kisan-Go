import { useTrans, LangToggle } from '../../context/LangContext'

// Top bar for driver screens: which business they drive for, and who they are.
export default function DriverHeader({ me, title, onSignOut }) {
  const { t } = useTrans()
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-11 items-center justify-between">
        <h1 className="text-[26px] font-extrabold tracking-[-0.8px] text-ink">{title}</h1>
        <div className="flex items-center gap-2">
          <LangToggle variant="light" />
          <button onClick={onSignOut} className="min-h-11 px-2 text-sm font-bold text-muted">
            {t('signOut')}
          </button>
        </div>
      </div>
      <p className="text-sm font-medium text-muted">
        {t('driverFor', { name: me.name, business: me.business_name ?? '' })}
      </p>
    </div>
  )
}
