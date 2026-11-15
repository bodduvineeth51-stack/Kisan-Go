import { useState } from 'react'
import { Check, LogOut, Plus, Repeat, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatPhone } from '../lib/phone'
import { VEHICLE_TYPES, normalizeVehicles, validateVehicles } from '../lib/vehicles'
import { useTrans, LangToggle } from '../context/LangContext'
import BottomNav from '../components/BottomNav'
import { Card, Field, PageHeader, PrimaryButton } from '../components/ui'

export default function OwnerProfile({ owner, onSaved, onSignOut, activeTab, onTabChange, driverFor, onSwitchToDriver }) {
  const { t } = useTrans()
  const [name, setName] = useState(owner.name)
  const [vehicles, setVehicles] = useState(() => owner.vehicle_rates.map(v => ({ ...v })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

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
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pb-32 pt-4">
        <PageHeader title={t('profileTab')} right={<LangToggle />} />

        <form onSubmit={save} className="flex flex-col gap-3.5">
          <fieldset disabled={saving} className="flex min-w-0 flex-col gap-3.5 disabled:opacity-70">
            <Card className="flex flex-col gap-4 p-5">
              <h2 className="text-lg font-extrabold">{t('basicDetails')}</h2>
              <Field
                id="owner-name"
                label={t('yourName')}
                value={name}
                maxLength={80}
                required
                autoComplete="name"
                onChange={e => { setName(e.target.value); setSaved(false) }}
              />
              <div>
                <p className="text-[15px] font-bold">{t('phoneLabel')}</p>
                <p className="mt-1 text-[17px] font-semibold text-muted">{formatPhone(owner.phone)}</p>
              </div>
            </Card>

            <Card className="flex flex-col gap-4 p-5">
              <h2 className="text-lg font-extrabold">{t('profileVehicles')}</h2>
              <datalist id="vehicle-suggestions">{VEHICLE_TYPES.map(type => <option key={type} value={type} />)}</datalist>
              {vehicles.map((v, index) => (
                <div key={index} className="flex flex-col gap-3 rounded-[18px] bg-mint-50 p-4">
                  <div className="flex items-end gap-2">
                    <Field
                      id={`vehicle-${index}`}
                      label={t('vehicleName')}
                      list="vehicle-suggestions"
                      value={v.type}
                      required
                      maxLength={50}
                      placeholder={t('vehicleExample')}
                      onChange={e => changeVehicle(index, 'type', e.target.value)}
                      className="min-w-0 flex-1"
                    />
                    <button
                      type="button"
                      disabled={vehicles.length <= 1}
                      aria-label={t('removeVehicle', { name: v.type || index + 1 })}
                      className="mb-[7px] flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface text-danger shadow-soft disabled:opacity-30"
                      onClick={() => { setVehicles(prev => prev.filter((_, i) => i !== index)); setSaved(false) }}
                    >
                      <Trash2 size={20} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </div>
                  <Field
                    id={`rate-${index}`}
                    label={t('hourlyRate')}
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max="10000000"
                    step="0.01"
                    value={v.hourly_rate}
                    required
                    onChange={e => changeVehicle(index, 'hourly_rate', e.target.value)}
                  />
                </div>
              ))}
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-mint-200 bg-surface text-base font-bold text-primary"
                onClick={() => { setVehicles(prev => [...prev, { type: '', hourly_rate: '' }]); setSaved(false) }}
              >
                <Plus size={20} strokeWidth={2.6} aria-hidden="true" />{t('addVehicle')}
              </button>
            </Card>
          </fieldset>
          {error && <p role="alert" className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
          {saved && (
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-mint-100 px-4 py-3 text-sm font-bold text-primary">
              <Check size={20} strokeWidth={2.6} aria-hidden="true" />{t('profileSaved')}
            </p>
          )}
          <PrimaryButton disabled={saving} type="submit">
            {saving ? t('savingProfile') : t('saveChanges')}
          </PrimaryButton>
        </form>
        {onSwitchToDriver && (
          <button
            onClick={onSwitchToDriver}
            className="flex min-h-14 items-center justify-center gap-2 rounded-[18px] bg-surface px-4 text-base font-bold text-primary shadow-card active:scale-[0.98]"
          >
            <Repeat size={20} strokeWidth={2.4} aria-hidden="true" />{t('switchToDriver', { business: driverFor })}
          </button>
        )}
        <button
          onClick={onSignOut}
          className="flex min-h-14 items-center justify-center gap-2 rounded-[18px] bg-surface text-base font-bold text-danger shadow-card"
        >
          <LogOut size={20} strokeWidth={2.4} aria-hidden="true" />{t('signOut')}
        </button>
      </div>
      <BottomNav active={activeTab} onChange={onTabChange} />
    </div>
  )
}
