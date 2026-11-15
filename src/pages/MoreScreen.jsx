import { LogOut, Languages, Truck } from 'lucide-react'
import { formatMoney } from '../lib/format'
import { formatPhone } from '../lib/bills'
import BottomNav from '../components/BottomNav'
import { LogoMark } from '../components/Logo'
import { useTrans } from '../context/LangContext'

// Profile, vehicles & rates, language, sign out.
export default function MoreScreen({ owner, onSignOut, activeTab, onTabChange }) {
  const { t, lang, setLang } = useTrans()
  const phone = (owner.phone ?? '').replace(/^\+?91/, '')

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pb-32 pt-4">
        <div className="flex h-11 items-center">
          <h1 className="text-[28px] font-extrabold tracking-[-0.8px]">{t('moreTab')}</h1>
        </div>

        {/* Owner */}
        <div className="flex items-center gap-3 rounded-[20px] bg-surface p-3.5 shadow-card">
          <LogoMark size={52} />
          <div className="min-w-0">
            <div className="truncate text-xl font-extrabold tracking-[-0.4px]">{owner.name}</div>
            {phone && <div className="text-sm font-semibold text-muted">+91 {formatPhone(phone)}</div>}
          </div>
        </div>

        {/* Vehicles */}
        <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
          <div className="flex items-center gap-2 border-b border-divider px-4 py-3 text-[15px] font-extrabold">
            <Truck size={18} strokeWidth={2.2} className="text-primary" aria-hidden="true" />
            {t('yourVehicles')}
          </div>
          {owner.vehicle_rates.map((v) => (
            <div key={v.type} className="flex justify-between border-b border-divider px-4 py-3 text-[15px] last:border-b-0">
              <span className="font-bold">{v.type}</span>
              <span className="font-semibold text-muted">{t('ratePerHour', { rate: formatMoney(v.hourly_rate) })}</span>
            </div>
          ))}
        </div>

        {/* Language */}
        <div className="rounded-[20px] bg-surface p-4 shadow-card">
          <div className="mb-2.5 flex items-center gap-2 text-[15px] font-extrabold">
            <Languages size={18} strokeWidth={2.2} className="text-primary" aria-hidden="true" />
            Language · భాష
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[['te', 'తెలుగు'], ['en', 'English']].map(([code, label]) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className={`h-[52px] rounded-2xl border-2 text-[17px] ${
                  lang === code ? 'border-primary-bright bg-mint-100 font-extrabold text-primary' : 'border-border font-semibold'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onSignOut}
          className="flex h-14 items-center justify-center gap-2 rounded-[18px] bg-surface text-base font-bold text-danger shadow-card"
        >
          <LogOut size={20} strokeWidth={2.2} aria-hidden="true" />
          {t('signOut')}
        </button>
      </div>

      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}
