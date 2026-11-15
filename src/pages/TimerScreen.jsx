import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Play, X, Mic } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { formatMoney, formatHours } from '../lib/format'
import { formatPhone } from '../lib/bills'
import Avatar from '../components/Avatar'
import VoiceEntry from '../components/VoiceEntry'
import { useTrans } from '../context/LangContext'

const RING_R = 88
const RING_C = 2 * Math.PI * RING_R // ≈ 553

function localDatetimeValue(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}

// Pre-pick the vehicle used last (or the first one) so the timer is
// two taps from the customer: open customer → Start.
const LAST_VEHICLE_KEY = 'kisan_last_vehicle'
function defaultVehicle(vehicles) {
  let last = null
  try { last = localStorage.getItem(LAST_VEHICLE_KEY) } catch { /* private mode */ }
  return vehicles.find((v) => v.type === last) ?? vehicles[0] ?? null
}

function clock(secs) {
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(secs / 3600))}:${p(Math.floor((secs % 3600) / 60))}:${p(secs % 60)}`
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// Minutes are rounded up per session — the owner never loses a part-minute.
function sessionMins(s) {
  return Math.ceil((new Date(s.stop) - new Date(s.start)) / 60000)
}

function minsLabel(mins) {
  return mins >= 60 ? formatHours(mins / 60) : `${mins} min`
}

export default function TimerScreen({ customer, owner, onComplete, onBack, onChangeCustomer }) {
  const { t } = useTrans()
  const vehicles = owner.vehicle_rates
  const [vehicle, setVehicleState] = useState(() => defaultVehicle(vehicles))
  const [sessions, setSessions] = useState([])
  const [activeStart, setActiveStart] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [showAddTime, setShowAddTime] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [manualStart, setManualStart] = useState('')
  const [manualStop, setManualStop] = useState('')
  const [manualError, setManualError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setVehicle(v) {
    setVehicleState(v)
    try { localStorage.setItem(LAST_VEHICLE_KEY, v.type) } catch { /* private mode */ }
  }

  useEffect(() => {
    if (!activeStart) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeStart])

  const running = activeStart !== null
  const liveSecs = running ? Math.max(0, Math.floor((now - activeStart.getTime()) / 1000)) : 0
  const doneMins = sessions.reduce((sum, s) => sum + sessionMins(s), 0)
  const totalMins = doneMins + (running ? Math.ceil(liveSecs / 60) : 0)
  const billSoFar = vehicle ? Math.round((totalMins / 60) * vehicle.hourly_rate) : 0
  const state = running ? 'live' : sessions.length > 0 ? 'paused' : 'ready'

  // Ring fills once per hour of the running session; when paused it shows
  // where the total time sits in the current hour.
  const ringSecs = running ? liveSecs : doneMins * 60
  const ringOffset = RING_C * (1 - (ringSecs % 3600) / 3600)

  function handleStart() {
    if (!vehicle) { setError(t('errSelectVehicle')); return }
    setError('')
    const d = new Date()
    setActiveStart(d)
    setNow(d.getTime())
  }

  function stopSession() {
    if (!activeStart) return sessions
    const next = [...sessions, { start: activeStart.toISOString(), stop: new Date().toISOString() }]
    setSessions(next)
    setActiveStart(null)
    return next
  }

  function openAddTime() {
    setManualStart(localDatetimeValue())
    setManualStop(localDatetimeValue())
    setManualError('')
    setShowAddTime(true)
  }

  function handleAddManual() {
    if (!manualStart || !manualStop) { setManualError(t('errPickTimes')); return }
    const s = new Date(manualStart)
    const e = new Date(manualStop)
    if (isNaN(s) || isNaN(e)) { setManualError(t('errInvalidDate')); return }
    if (e <= s) { setManualError(t('errStopAfterStart')); return }
    setSessions((prev) => [...prev, { start: s.toISOString(), stop: e.toISOString() }])
    setShowAddTime(false)
  }

  function handleVoiceConfirm({ vehicle: parsedVehicle, session }) {
    if (parsedVehicle) setVehicle(parsedVehicle)
    if (session?.start && session?.stop) setSessions((prev) => [...prev, session])
    setShowVoice(false)
    setShowAddTime(false)
  }

  function handleChange() {
    if ((sessions.length > 0 || running) && !window.confirm(t('discardJobConfirm'))) return
    onChangeCustomer()
  }

  function handleBack() {
    if ((sessions.length > 0 || running) && !window.confirm(t('discardJobConfirm'))) return
    onBack()
  }

  // Finish works while the timer runs too: it stops the session first.
  async function handleFinish() {
    setError('')
    if (!vehicle) { setError(t('errSelectVehicle')); return }
    const all = stopSession()
    if (all.length === 0) { setError(t('errAddSession')); return }

    const mins = all.reduce((sum, s) => sum + sessionMins(s), 0)
    const totalHours = Math.round((mins / 60) * 100) / 100
    const amount = Math.round((mins / 60) * vehicle.hourly_rate)

    setSaving(true)
    const { data, error } = await supabase
      .from('work_records')
      .insert({
        customer_id: customer.id,
        owner_id: owner.id,
        vehicle_type: vehicle.type,
        hourly_rate: vehicle.hourly_rate,
        sessions: all,
        total_hours: totalHours,
        amount,
        whatsapp_status: 'pending',
      })
      .select()
      .single()
    setSaving(false)
    if (error) { setError(error.message); return }
    onComplete(data)
  }

  const badge = {
    live:   { cls: 'bg-danger/10 text-danger', text: 'LIVE' },
    paused: { cls: 'bg-divider text-muted',    text: t('pausedBadge') },
  }[state]

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-3 px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4">
        {/* Top bar */}
        <div className="flex h-11 items-center gap-3">
          <button
            onClick={handleBack}
            aria-label={t('back')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface text-ink shadow-[0_2px_10px_rgba(15,42,26,0.08)]"
          >
            <ChevronLeft size={22} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <h1 className="text-[22px] font-extrabold tracking-[-0.5px]">{t('workInProgress')}</h1>
          {badge && (
            <span className={`ml-auto flex items-center gap-1.5 rounded-xl px-2.5 py-[5px] text-xs font-extrabold ${badge.cls}`}>
              <span className={`h-2 w-2 rounded-full bg-current ${state === 'live' ? 'animate-pulse' : ''}`} />
              {badge.text}
            </span>
          )}
        </div>

        {/* Customer */}
        <div className="flex items-center gap-3 rounded-[20px] bg-surface px-3 py-2.5 shadow-card">
          <Avatar id={customer.id} name={customer.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-extrabold">{customer.name}</span>
            <span className="block text-[13px] font-medium text-muted">{formatPhone(customer.phone)}</span>
          </span>
          <button
            onClick={handleChange}
            className="min-h-11 rounded-xl bg-mint-50 px-3 text-sm font-bold text-primary"
          >
            {t('change')}
          </button>
        </div>

        {/* Vehicle choice */}
        <div className={`grid gap-2.5 ${vehicles.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {vehicles.map((v) => {
            const on = vehicle?.type === v.type
            return (
              <button
                key={v.type}
                onClick={() => setVehicle(v)}
                disabled={running && !on}
                aria-pressed={on}
                className={`flex h-14 flex-col items-center justify-center rounded-[18px] border-2 leading-[1.2] disabled:opacity-50 ${
                  on ? 'border-primary-bright bg-mint-100 text-primary' : 'border-border bg-surface text-ink'
                }`}
              >
                <span className={`text-base ${on ? 'font-extrabold' : 'font-bold'}`}>{v.type}</span>
                <span className={`text-xs ${on ? 'font-bold' : 'font-medium text-muted'}`}>
                  {t('ratePerHour', { rate: formatMoney(v.hourly_rate) })}
                </span>
              </button>
            )
          })}
        </div>

        {/* Ring timer */}
        <div className="relative h-[204px] w-[204px] self-center">
          <svg width="204" height="204" viewBox="0 0 204 204" aria-hidden="true" className="absolute inset-0">
            <circle cx="102" cy="102" r={RING_R} fill="#FFFFFF" stroke="var(--color-mint-100)" strokeWidth="14" />
            <circle
              cx="102" cy="102" r={RING_R} fill="none"
              stroke={running ? 'var(--color-primary-bright)' : '#9CA3AF'}
              strokeWidth="14" strokeLinecap="round"
              strokeDasharray={RING_C} strokeDashoffset={ringOffset}
              transform="rotate(-90 102 102)"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center" role="timer" aria-live="off">
            <span className="text-[13px] font-bold text-muted">
              {state === 'live' ? t('sessionN', { n: sessions.length + 1 })
                : state === 'paused' ? t('pausedLabel') : t('readyLabel')}
            </span>
            <span className="text-[38px] font-extrabold leading-[1.15] tracking-[-1px] tabular-nums">
              {clock(running ? liveSecs : doneMins * 60)}
            </span>
          </div>
        </div>

        {/* Start / Stop / Start again */}
        {state === 'live' ? (
          <button
            onClick={stopSession}
            className="flex h-[72px] shrink-0 items-center justify-center gap-3.5 rounded-3xl bg-danger text-white shadow-[0_10px_22px_rgba(220,38,38,0.3)] active:scale-[0.98]"
          >
            <span className="h-[26px] w-[26px] rounded-[7px] bg-surface" />
            <span className="text-2xl font-extrabold">Stop</span>
            <span className="text-base font-semibold opacity-90">· ఆపండి</span>
          </button>
        ) : (
          <button
            onClick={handleStart}
            className={`flex h-[72px] shrink-0 items-center justify-center gap-3.5 rounded-3xl text-white active:scale-[0.98] ${
              state === 'paused'
                ? 'bg-ink shadow-[0_10px_22px_rgba(15,42,26,0.25)]'
                : 'bg-primary-bright shadow-[0_10px_24px_rgba(22,163,74,0.35)]'
            }`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime">
              <Play size={20} fill="#0F2A1A" strokeWidth={0} aria-hidden="true" />
            </span>
            {state === 'paused' ? (
              <span className="text-[22px] font-extrabold">{t('startAgain')}</span>
            ) : (
              <>
                <span className="text-2xl font-extrabold">Start</span>
                <span className="text-base font-semibold opacity-90">· మొదలుపెట్టండి</span>
              </>
            )}
          </button>
        )}

        {/* Sessions + totals */}
        {(sessions.length > 0 || running) && (
          <div className="overflow-hidden rounded-[22px] bg-surface shadow-card">
            {sessions.map((s, i) => (
              <div key={i} className="flex items-center justify-between border-b border-divider py-1 pl-4 pr-1 text-[15px]">
                <span className="font-medium text-muted">{i + 1} · {fmtTime(s.start)} – {fmtTime(s.stop)}</span>
                <span className="flex items-center">
                  <span className="font-bold">{minsLabel(sessionMins(s))}</span>
                  {!running && (
                    <button
                      onClick={() => setSessions((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={t('removeSession')}
                      className="flex h-11 w-11 items-center justify-center text-muted"
                    >
                      <X size={16} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  )}
                </span>
              </div>
            ))}
            {running && (
              <div className="flex justify-between border-b border-divider px-4 py-[9px] text-[15px]">
                <span className="font-medium text-muted">
                  {sessions.length + 1} · {fmtTime(activeStart.toISOString())} – {t('nowLabel')}
                </span>
                <span className="font-bold">{Math.floor(liveSecs / 60)} min</span>
              </div>
            )}
            <div className="flex items-center justify-between bg-primary px-4 py-3 text-white">
              <span>
                <span className="block text-xs font-semibold text-mint-100">{t('totalTime')}</span>
                <span className="block text-[19px] font-extrabold">{formatHours(totalMins / 60)}</span>
              </span>
              <span className="text-right">
                <span className="block text-xs font-semibold text-mint-100">{t('billSoFar')}</span>
                <span className="block text-2xl font-extrabold tracking-[-0.5px]">
                  {vehicle ? formatMoney(billSoFar) : '—'}
                </span>
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-[18px] bg-surface px-4 py-3 text-sm font-semibold text-danger shadow-card">{error}</p>
        )}

        {/* Bottom actions */}
        <div className="mt-auto flex gap-2.5 pt-2">
          <button
            onClick={openAddTime}
            disabled={running}
            className="flex h-[58px] items-center gap-1.5 rounded-[18px] bg-surface px-4 text-[15px] font-bold text-primary shadow-card disabled:opacity-50"
          >
            <Plus size={20} strokeWidth={2.6} aria-hidden="true" />
            {t('addTime')}
          </button>
          <button
            onClick={handleFinish}
            disabled={saving || (sessions.length === 0 && !running)}
            className="flex h-[58px] flex-1 items-center justify-center rounded-[18px] bg-primary text-[17px] font-extrabold text-white shadow-green disabled:opacity-50 disabled:shadow-none"
          >
            {saving ? t('savingLabel') : t('finishSendBill')}
          </button>
        </div>
      </div>

      {/* Add time sheet: type it, or say it */}
      {showAddTime && (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/50" onClick={() => setShowAddTime(false)}>
          <div
            className="mx-auto w-full max-w-lg rounded-t-[26px] bg-bg px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border" />
            <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.5px]">{t('addTime')}</h2>
            <button
              onClick={() => setShowVoice(true)}
              className="mb-4 flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-surface text-base font-bold text-primary shadow-card"
            >
              <Mic size={20} strokeWidth={2.2} aria-hidden="true" />
              {t('sayTheTime')}
            </button>
            <div className="flex flex-col gap-2.5">
              {[[t('startLabel'), manualStart, setManualStart], [t('stopLabel'), manualStop, setManualStop]].map(([label, val, set]) => (
                <label key={label} className="block">
                  <span className="mb-1 block text-sm font-bold text-muted">{label}</span>
                  <input
                    type="datetime-local"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    className="h-14 w-full rounded-[18px] border-2 border-border bg-surface px-3 text-base font-semibold outline-none focus:border-primary-bright"
                  />
                </label>
              ))}
            </div>
            {manualError && <p className="mt-2 text-sm font-semibold text-danger">{manualError}</p>}
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => setShowAddTime(false)}
                className="h-[58px] flex-1 rounded-[18px] bg-surface text-base font-bold text-ink shadow-card"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleAddManual}
                className="h-[58px] flex-[2] rounded-[18px] bg-primary text-base font-extrabold text-white shadow-green"
              >
                {t('addTime')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showVoice && (
        <VoiceEntry
          customer={customer}
          vehicleTypes={vehicles}
          onConfirm={handleVoiceConfirm}
          onClose={() => setShowVoice(false)}
        />
      )}
    </div>
  )
}
