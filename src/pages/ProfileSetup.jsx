import { useState } from 'react'
import { ChevronLeft, Check } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useTrans, LangButton } from '../context/LangContext'

const VEHICLE_TYPES = [
  'Tractor', 'Harvester', 'Rotavator', 'Trailer',
  'Cultivator', 'Seed Drill', 'Sprayer', 'Thresher',
]

export default function ProfileSetup({ user, onComplete, onBack }) {
  const { t } = useTrans()
  const [name, setName] = useState('')
  const [selectedTypes, setSelectedTypes] = useState([])
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function toggleType(type) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((v) => v !== type) : [...prev, type]
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError(t('enterName')); return }
    if (selectedTypes.length === 0) { setError(t('selectVehicleErr')); return }
    const vehicleRates = selectedTypes.map((type) => ({ type, hourly_rate: Number(rates[type]) }))
    if (vehicleRates.some((v) => !v.hourly_rate || v.hourly_rate <= 0)) {
      setError(t('validRateErr')); return
    }
    setLoading(true)
    const { error } = await supabase.from('owners').insert({
      id: user.id,
      name: name.trim(),
      phone: user.phone,
      vehicle_rates: vehicleRates,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    onComplete()
  }

  return (
    <div className="min-h-svh">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4"
      >
        <div className="flex h-11 items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('changePhone')}
            className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-surface text-ink shadow-[0_2px_10px_rgba(15,42,26,0.08)]"
          >
            <ChevronLeft size={22} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <LangButton />
        </div>

        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.15] tracking-[-0.8px]">{t('profileTitle')}</h1>
          <p className="mt-1 text-[15px] font-medium text-muted">{t('profileSub')}</p>
        </div>

        <div className="flex flex-col gap-2.5">
          <label htmlFor="name" className="text-[15px] font-bold">{t('yourName')}</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            className="h-14 rounded-[18px] border-2 border-border bg-surface px-4 text-lg font-bold outline-none placeholder:font-semibold placeholder:text-muted/50 focus:border-primary-bright"
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[15px] font-bold">{t('vehicleSection')}</span>
          {VEHICLE_TYPES.map((type) => {
            const checked = selectedTypes.includes(type)
            return (
              <div
                key={type}
                className={`overflow-hidden rounded-[18px] border-2 ${
                  checked ? 'border-primary-bright bg-mint-100' : 'border-border bg-surface'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleType(type)}
                  aria-pressed={checked}
                  className="flex h-14 w-full items-center gap-3 px-4 text-left"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 ${
                      checked ? 'border-primary bg-primary text-white' : 'border-border bg-surface'
                    }`}
                  >
                    {checked && <Check size={16} strokeWidth={3.2} aria-hidden="true" />}
                  </span>
                  <span className={`text-base ${checked ? 'font-extrabold text-primary' : 'font-semibold'}`}>{type}</span>
                </button>
                {checked && (
                  <label className="flex items-center gap-2 px-4 pb-3">
                    <span className="text-sm font-bold text-primary">{t('ratePlaceholder')}</span>
                    <span className="ml-auto flex h-12 items-center rounded-2xl bg-surface pl-3">
                      <span className="text-lg font-bold text-muted">₹</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={rates[type] ?? ''}
                        onChange={(e) => setRates((prev) => ({ ...prev, [type]: e.target.value }))}
                        aria-label={`${type} ${t('ratePlaceholder')}`}
                        className="h-full w-28 bg-transparent px-2 text-lg font-extrabold outline-none"
                      />
                    </span>
                  </label>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="text-sm font-semibold text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 h-16 rounded-[20px] bg-primary text-xl font-extrabold text-white shadow-green disabled:opacity-60"
        >
          {loading ? t('savingProfile') : t('saveProfile')}
        </button>
      </form>
    </div>
  )
}
