import { useState } from 'react'
import { Check, LogOut, Plus, Tractor, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatPhone } from '../lib/phone'
import { VEHICLE_TYPES, normalizeVehicles, validateVehicles } from '../lib/vehicles'
import { useTrans, LangToggle } from '../context/LangContext'
import BottomNav from '../components/BottomNav'

export default function OwnerProfile({ owner, onSaved, onSignOut, activeTab, onTabChange }) {
  const { t } = useTrans()
  const [name, setName] = useState(owner.name)
  const [vehicles, setVehicles] = useState(() => owner.vehicle_rates.map(v => ({ ...v })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const input = 'mt-2 min-h-12 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base font-semibold text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary'

  function changeVehicle(index, field, value) {
    setSaved(false)
    setVehicles(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v))
  }

  async function save(e) {
    e.preventDefault()
    if (saving) return
    setError('')
    setSaved(false)
    if (!name.trim() || name.trim().length > 80) { setError(t('enterName')); return }
    const invalid = validateVehicles(vehicles)
    if (invalid) { setError(t(invalid)); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.from('owners')
        .update({ name: name.trim(), vehicle_rates: normalizeVehicles(vehicles) })
        .eq('id', owner.id).select().single()
      if (error) throw error
      setName(data.name)
      setVehicles(data.vehicle_rates)
      onSaved(data)
      setSaved(true)
    } catch {
      setError(t('profileSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pb-32 pt-4">
        <header className="flex min-h-11 items-center justify-between gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.8px]">{t('ownerProfile')}</h1>
          <LangToggle variant="light" />
        </header>
        <div className="relative overflow-hidden rounded-[26px] bg-primary p-5 text-white shadow-green">
          <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-circle-1 opacity-40" />
          <p className="relative text-sm font-semibold text-mint-100">{t('yourBusiness')}</p>
          <h2 className="relative mt-1 break-words text-2xl font-extrabold">{owner.name}</h2>
          <p className="relative mt-2 text-base font-semibold">{formatPhone(owner.phone)}</p>
          <p className="relative mt-3 text-sm text-mint-100">{t('vehicleCount', { n: owner.vehicle_rates.length })}</p>
        </div>

        <form onSubmit={save} className="flex flex-col gap-4">
          <fieldset disabled={saving} className="min-w-0 space-y-4 disabled:opacity-70">
            <section className="rounded-[22px] bg-surface p-5 shadow-card">
              <h2 className="mb-4 text-lg font-extrabold">{t('basicDetails')}</h2>
              <label htmlFor="owner-name" className="text-sm font-bold text-muted">{t('yourName')}</label>
              <input id="owner-name" value={name} maxLength={80} required className={input}
                onChange={e => { setName(e.target.value); setSaved(false) }} autoComplete="name" />
              <p className="mt-4 text-sm font-bold text-muted">{t('phoneLabel')}</p>
              <p className="mt-1 font-semibold">{formatPhone(owner.phone)}</p>
              <p className="mt-1 text-sm text-muted">{t('verifiedLoginPhone')}</p>
            </section>

            <section className="rounded-[22px] bg-surface p-5 shadow-card">
              <h2 className="text-lg font-extrabold">{t('profileVehicles')}</h2>
              <p className="mt-1 text-sm text-muted">{t('ratesHelp')}</p>
              <datalist id="vehicle-suggestions">{VEHICLE_TYPES.map(type => <option key={type} value={type} />)}</datalist>
              <div className="mt-4 space-y-4">
                {vehicles.map((v, index) => (
                  <div key={index} className="rounded-[18px] bg-mint-50 p-4">
                    <div className="mb-2 flex items-center justify-between text-primary">
                      <Tractor size={24} aria-hidden="true" />
                      <button type="button" disabled={vehicles.length <= 1} aria-label={t('removeVehicle', { name: v.type || index + 1 })}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-danger disabled:opacity-30"
                        onClick={() => { setVehicles(prev => prev.filter((_, i) => i !== index)); setSaved(false) }}>
                        <Trash2 size={20} aria-hidden="true" />
                      </button>
                    </div>
                    <label htmlFor={`vehicle-${index}`} className="text-sm font-bold text-muted">{t('vehicleName')}</label>
                    <input id={`vehicle-${index}`} list="vehicle-suggestions" value={v.type} required maxLength={50}
                      className={input} placeholder={t('vehicleExample')} onChange={e => changeVehicle(index, 'type', e.target.value)} />
                    <label htmlFor={`rate-${index}`} className="mt-3 block text-sm font-bold text-muted">{t('hourlyRate')}</label>
                    <input id={`rate-${index}`} type="number" inputMode="decimal" min="0.01" max="10000000" step="0.01"
                      value={v.hourly_rate} required className={input} onChange={e => changeVehicle(index, 'hourly_rate', e.target.value)} />
                  </div>
                ))}
              </div>
              <button type="button" className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-primary font-extrabold text-primary"
                onClick={() => { setVehicles(prev => [...prev, { type: '', hourly_rate: '' }]); setSaved(false) }}>
                <Plus size={20} aria-hidden="true" />{t('addVehicle')}
              </button>
            </section>
          </fieldset>
          {error && <p role="alert" className="rounded-2xl bg-due-bg p-4 text-sm font-semibold text-danger">{error}</p>}
          {saved && <p role="status" className="flex items-center gap-2 rounded-2xl bg-mint-100 p-4 text-sm font-bold text-primary"><Check size={20} />{t('profileSaved')}</p>}
          <button disabled={saving} type="submit" className="min-h-14 rounded-2xl bg-primary text-lg font-extrabold text-white shadow-green disabled:opacity-60">
            {saving ? t('savingProfile') : t('saveChanges')}
          </button>
        </form>
        <button onClick={onSignOut} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-border bg-surface font-bold text-danger">
          <LogOut size={20} />{t('signOut')}
        </button>
      </div>
      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}
