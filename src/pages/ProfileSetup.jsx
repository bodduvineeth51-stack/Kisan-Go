import { useState } from 'react'
import { Check, ChevronLeft } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useTrans } from '../context/LangContext'
import { toE164 } from '../lib/phone'
import { VEHICLE_TYPES, validateVehicles } from '../lib/vehicles'
import { ChoiceButton, Field, FieldLabel, PrimaryButton } from '../components/ui'
import { LanguageChoice, LoginHero } from './Login'

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
    const invalid = validateVehicles(vehicleRates)
    if (invalid) { setError(t(invalid)); return }
    setLoading(true)
    const { error } = await supabase.from('owners').insert({
      id: user.id,
      name: name.trim(),
      phone: toE164(user.phone) ?? user.phone,
      vehicle_rates: vehicleRates,
    })
    setLoading(false)
    if (error) {
      // Phase 2 trigger: a phone that is already someone's driver can't sign up as an owner.
      setError(error.message?.includes('phone_is_driver') ? t('phoneIsDriver') : error.message)
      return
    }
    onComplete()
  }

  return (
    <div className="min-h-svh bg-surface">
      <div className="mx-auto w-full max-w-lg">
        <LoginHero compact />

        <form className="flex flex-col gap-[22px] px-6 pb-8 pt-5" onSubmit={handleSubmit}>
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 flex min-h-11 items-center gap-1 self-start text-sm font-bold text-muted"
          >
            <ChevronLeft size={20} strokeWidth={2.4} aria-hidden="true" />
            {t('changePhone')}
          </button>

          <div>
            <h1 className="text-[28px] font-extrabold leading-[1.15] tracking-[-0.8px]">{t('profileTitle')}</h1>
            <p className="mt-1 text-base font-medium text-muted">{t('profileSub')}</p>
          </div>

          <LanguageChoice />

          <Field
            id="name"
            label={t('yourName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            autoComplete="name"
          />

          <div className="flex flex-col gap-2.5">
            <FieldLabel>{t('vehicleSection')}</FieldLabel>
            <div className="grid grid-cols-2 gap-2.5">
              {VEHICLE_TYPES.map((type) => {
                const on = selectedTypes.includes(type)
                return (
                  <ChoiceButton key={type} selected={on} onClick={() => toggleType(type)} className="text-base">
                    {on && <Check size={16} strokeWidth={3} aria-hidden="true" />}
                    {type}
                  </ChoiceButton>
                )
              })}
            </div>
          </div>

          {selectedTypes.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <FieldLabel>{t('hourlyRate')}</FieldLabel>
              {selectedTypes.map((type) => (
                <label
                  key={type}
                  htmlFor={`rate-${type}`}
                  className="flex h-[58px] items-center gap-3 rounded-[18px] border-2 border-border bg-mint-50 pl-4 pr-1.5 focus-within:border-primary-bright"
                >
                  <span className="min-w-0 flex-1 truncate text-base font-bold text-ink">{type}</span>
                  <span className="text-base font-bold text-primary">₹</span>
                  <input
                    id={`rate-${type}`}
                    type="number"
                    inputMode="decimal"
                    min="1"
                    placeholder={t('ratePlaceholder')}
                    value={rates[type] ?? ''}
                    onChange={(e) => setRates((prev) => ({ ...prev, [type]: e.target.value }))}
                    className="h-11 w-28 rounded-xl bg-surface px-3 text-right text-[17px] font-bold text-ink outline-none"
                  />
                </label>
              ))}
            </div>
          )}

          {error && <p role="alert" className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-danger">{error}</p>}

          <PrimaryButton type="submit" disabled={loading} arrow={!loading}>
            {loading ? t('savingProfile') : t('saveProfile')}
          </PrimaryButton>
        </form>
      </div>
    </div>
  )
}
