import { useState, useEffect } from 'react'
import { Check, Mic, Plus, RotateCw, Wallet, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { driverRpc, AccessRemovedError } from '../lib/roles'
import { formatMoney, formatHours } from '../lib/format'
import { lastVehicle, rememberVehicle } from '../lib/vehicles'
import { holdUpdates } from '../lib/appUpdate'
import VoiceEntry from '../components/VoiceEntry'
import Avatar from '../components/Avatar'
import { BackButton, ChoiceButton, Field, PrimaryButton, SecondaryButton, Sheet } from '../components/ui'
import { useTrans } from '../context/LangContext'

function localDatetimeValue(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}

const pad = (n) => String(n).padStart(2, '0')
function clock(secs) {
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}:${pad(secs % 60)}`
}

// Billable minutes of one session — same rounding the database uses.
function sessionMins(s) {
  return Math.ceil((new Date(s.stop) - new Date(s.start)) / 60000)
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const RING = 2 * Math.PI * 88 // circumference of the r=88 ring

// Used by owners and drivers (kisan-design/screens/3-work-timer.html).
// The clock starts as soon as the screen opens — picking the customer and
// tapping Start work is the whole flow. Hours and amount are worked out by
// the database (submit_work_record); the numbers here are only a preview.
export default function TimerScreen({
  customer,
  vehicleRates = [],
  onComplete,
  onBack,
  role = 'owner',
  onAccessRemoved = () => {},
}) {
  const { t, lang } = useTrans()
  // Open with the vehicle this phone used last (an owner with two
  // harvesters must not have every job land on "Harvester 1").
  const [selectedType, setSelectedTypeState] = useState(() => {
    const last = lastVehicle()
    return vehicleRates.some((v) => v.type === last) ? last : vehicleRates[0]?.type ?? null
  })
  function setSelectedType(type) {
    setSelectedTypeState(type)
    rememberVehicle(type)
  }
  // Follows refreshed rates; null if the owner removed this vehicle meanwhile.
  const vehicle = vehicleRates.find((v) => v.type === selectedType) ?? null
  const [sessions, setSessions] = useState([])
  const [activeStart, setActiveStart] = useState(() => (vehicleRates.length ? new Date() : null))
  const [now, setNow] = useState(() => Date.now())
  const [showAddTime, setShowAddTime] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [manualStart, setManualStart] = useState('')
  const [manualStop, setManualStop] = useState('')
  const [manualError, setManualError] = useState('')
  const [submitPhase, setSubmitPhase] = useState(null)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(null) // { record, whatsapp_status, sessionCount }

  // Never swap in a new app version (page reload) while this screen is open.
  useEffect(() => holdUpdates(), [])

  useEffect(() => {
    if (!activeStart) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeStart])

  const running = activeStart !== null
  const runningSession = running ? { start: activeStart.toISOString(), stop: new Date(Math.max(now, activeStart.getTime())).toISOString() } : null

  function handleStart() { setError(''); setActiveStart(new Date()) }

  function handleStop() {
    if (!activeStart) return
    setSessions((prev) => [...prev, { start: activeStart.toISOString(), stop: new Date().toISOString() }])
    setActiveStart(null)
  }

  function openAddTime() {
    setManualStart(localDatetimeValue())
    setManualStop(localDatetimeValue())
    setManualError('')
    setShowAddTime(true)
  }

  function handleAddManual(e) {
    e.preventDefault()
    if (!manualStart || !manualStop) { setManualError(t('errPickTimes')); return }
    const s = new Date(manualStart)
    const en = new Date(manualStop)
    if (isNaN(s) || isNaN(en)) { setManualError(t('errInvalidDate')); return }
    if (en <= s) { setManualError(t('errStopAfterStart')); return }
    setSessions((prev) => [...prev, { start: s.toISOString(), stop: en.toISOString() }])
    setShowAddTime(false)
  }

  function handleVoiceConfirm({ vehicle: parsedVehicle, session }) {
    if (parsedVehicle) setSelectedType(parsedVehicle.type)
    if (session?.start && session?.stop) setSessions((prev) => [...prev, session])
    setShowVoice(false)
  }

  async function handleFinish() {
    if (submitPhase) return
    setError('')
    if (!vehicle) { setError(t('errSelectVehicle')); return }
    // Finishing while the clock runs stops the current session first.
    const all = running ? [...sessions, { start: activeStart.toISOString(), stop: new Date().toISOString() }] : sessions
    if (running) { setSessions(all); setActiveStart(null) }
    if (all.length === 0) { setError(t('errAddSession')); return }

    setSubmitPhase('saving')
    let record
    try {
      const rows = await driverRpc('submit_work_record', {
        p_customer_id: customer.id,
        p_vehicle_type: vehicle.type,
        p_sessions: all,
      })
      record = rows?.[0]
      if (!record) throw new Error(t('submitFailed'))
    } catch (err) {
      setSubmitPhase(null)
      if (err instanceof AccessRemovedError && role === 'driver') { onAccessRemoved(); return }
      setError(submitErrorText(err, t))
      return
    }

    setSubmitPhase('sending')
    const whatsapp_status = await sendBill(record.id, lang)
    setSubmitPhase(null)
    setSubmitted({ record, whatsapp_status, sessionCount: all.length })
  }

  if (submitted) {
    return (
      <BillSent
        customer={customer}
        role={role}
        {...submitted}
        onRetry={async () => {
          setSubmitted((s) => ({ ...s, whatsapp_status: 'sending' }))
          const status = await sendBill(submitted.record.id, lang)
          setSubmitted((s) => ({ ...s, whatsapp_status: status }))
        }}
        onDone={() => onComplete(submitted.record)}
      />
    )
  }

  const shown = runningSession ? [...sessions, runningSession] : sessions
  const totalMins = shown.reduce((sum, s) => sum + sessionMins(s), 0)
  const amount = vehicle ? Math.round((totalMins / 60) * vehicle.hourly_rate) : 0
  const runSecs = running ? Math.max(0, Math.floor((now - activeStart.getTime()) / 1000)) : 0
  const last = sessions[sessions.length - 1]
  const clockSecs = running ? runSecs : last ? Math.round((new Date(last.stop) - new Date(last.start)) / 1000) : 0
  const ringOffset = RING * (1 - (clockSecs % 3600) / 3600)

  return (
    <div className="min-h-svh">
      <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-3 px-5 pb-5 pt-4">
        {/* Header */}
        <div className="flex h-11 items-center gap-3">
          <BackButton onClick={onBack} />
          <h1 className="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-[-0.5px]">{t('workInProgress')}</h1>
          {(running || sessions.length > 0) && (
            <span
              className={`flex items-center gap-1.5 rounded-xl px-2.5 py-[5px] text-xs font-extrabold ${
                running ? 'bg-live-bg text-live' : 'bg-idle-bg text-idle'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${running ? 'animate-pulse bg-live' : 'bg-idle'}`} />
              {running ? t('liveBadge') : t('pausedBadge')}
            </span>
          )}
        </div>

        {/* Customer */}
        <div className="flex items-center gap-3 rounded-[20px] bg-surface py-2 pl-3 pr-2 shadow-card">
          <Avatar name={customer.name} size="lg" />
          <span className="min-w-0 flex-1 truncate text-[17px] font-extrabold">{customer.name}</span>
          <button onClick={onBack} className="min-h-11 rounded-xl bg-mint-50 px-3 text-sm font-bold text-primary">
            {t('change')}
          </button>
        </div>

        {/* Vehicle */}
        {vehicleRates.length === 0 ? (
          <p className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-due">{t('noVehicles')}</p>
        ) : (
          <div className={`grid gap-2.5 ${vehicleRates.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {vehicleRates.map((v) => {
              const on = vehicle?.type === v.type
              return (
                <ChoiceButton key={v.type} selected={on} onClick={() => setSelectedType(v.type)} className="flex-col gap-0! leading-[1.2]">
                  <span className="text-base">{v.type}</span>
                  <span className={`text-xs ${on ? 'font-bold' : 'font-medium text-muted'}`}>
                    {t('ratePerHour', { rate: formatMoney(v.hourly_rate) })}
                  </span>
                </ChoiceButton>
              )
            })}
          </div>
        )}

        {/* Ring clock */}
        <div className="relative h-[204px] w-[204px] self-center">
          <svg width="204" height="204" viewBox="0 0 204 204" aria-hidden="true" className="absolute inset-0">
            <circle cx="102" cy="102" r="88" className="fill-surface stroke-mint-100" strokeWidth="14" />
            <circle
              cx="102" cy="102" r="88" fill="none" strokeWidth="14" strokeLinecap="round"
              className={running ? 'stroke-primary-bright' : 'stroke-ring-idle'}
              strokeDasharray={RING} strokeDashoffset={ringOffset} transform="rotate(-90 102 102)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center" role="timer" aria-live="off">
            <span className="text-[38px] font-extrabold leading-[1.15] tracking-[-1px] tabular-nums">{clock(clockSecs)}</span>
          </div>
        </div>

        {/* Stop / Start again */}
        {running ? (
          <button
            onClick={handleStop}
            className="flex h-[68px] shrink-0 items-center justify-center gap-3 rounded-[20px] bg-danger text-white shadow-danger active:scale-[0.98]"
          >
            <span className="h-[20px] w-[20px] rounded-[5px] bg-surface" />
            <span className="text-2xl font-extrabold">{t('stopBtn')}</span>
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={!vehicle || submitPhase !== null}
            className="flex h-[68px] shrink-0 items-center justify-center gap-3 rounded-[20px] bg-ink text-white shadow-dark active:scale-[0.98] disabled:opacity-40"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7z" fill="currentColor" /></svg>
            <span className="text-[22px] font-extrabold">{sessions.length ? t('startAgain') : t('startBtn')}</span>
          </button>
        )}

        {/* Sessions + running total */}
        {shown.length > 0 && (
          <div className="overflow-hidden rounded-[22px] bg-surface shadow-card">
            {shown.map((s, i) => {
              const isLive = running && i === shown.length - 1
              return (
                <div key={s.start + i} className="flex items-center justify-between gap-2 border-b border-divider py-1 pl-4 pr-1 text-[15px]">
                  <span className="font-medium text-muted">
                    {i + 1} · {fmtTime(s.start)} – {isLive ? t('now') : fmtTime(s.stop)}
                  </span>
                  <span className="flex items-center">
                    <span className="font-bold">{sessionMins(s)} min</span>
                    <button
                      onClick={() => (isLive ? setActiveStart(null) : setSessions((prev) => prev.filter((_, j) => j !== i)))}
                      aria-label={t('removeSession', { n: i + 1 })}
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-muted active:bg-mint-50"
                    >
                      <X size={18} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  </span>
                </div>
              )
            })}
            <div className="flex items-center justify-between bg-primary px-4 py-3 text-white">
              <span>
                <span className="block text-xs font-semibold text-white/80">{t('totalTime')}</span>
                <span className="block text-[19px] font-extrabold">{formatHours(totalMins / 60)}</span>
              </span>
              <span className="text-right">
                <span className="block text-xs font-semibold text-white/80">{t('billSoFar')}</span>
                <span className="block text-2xl font-extrabold tracking-[-0.5px]">{formatMoney(amount)}</span>
              </span>
            </div>
          </div>
        )}

        {error && <p role="alert" className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-danger">{error}</p>}

        {/* Add time / Finish */}
        <div className="mt-auto flex gap-2.5 pt-1">
          <SecondaryButton onClick={openAddTime} disabled={submitPhase !== null} className="text-[15px]">
            <Plus size={20} strokeWidth={2.6} aria-hidden="true" />
            {t('addTime')}
          </SecondaryButton>
          <button
            onClick={handleFinish}
            disabled={submitPhase !== null || !vehicle}
            className="flex min-h-[58px] flex-1 items-center justify-center rounded-[18px] bg-primary px-3 text-[17px] font-extrabold text-white shadow-green active:scale-[0.98] disabled:opacity-60"
          >
            {submitPhase === 'saving' ? t('savingLabel') : submitPhase === 'sending' ? t('sendingWaLabel') : t('submitJob')}
          </button>
        </div>
      </div>

      {showAddTime && (
        <Sheet title={t('addTimeTitle')} onClose={() => setShowAddTime(false)}>
          <form className="flex flex-col gap-4" onSubmit={handleAddManual}>
            <div className="grid grid-cols-1 gap-3">
              <Field id="manual-start" label={t('startLabel')} type="datetime-local" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
              <Field id="manual-stop" label={t('stopLabel')} type="datetime-local" value={manualStop} onChange={(e) => setManualStop(e.target.value)} />
            </div>
            {manualError && <p role="alert" className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-danger">{manualError}</p>}
            <PrimaryButton type="submit">{t('save')}</PrimaryButton>
            <button
              type="button"
              onClick={() => { setShowAddTime(false); setShowVoice(true) }}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-[18px] bg-mint-50 text-base font-bold text-primary"
            >
              <Mic size={20} strokeWidth={2.2} aria-hidden="true" />
              {t('addByVoice')}
            </button>
          </form>
        </Sheet>
      )}

      {showVoice && (
        <VoiceEntry
          customer={customer}
          vehicleTypes={vehicleRates}
          onConfirm={handleVoiceConfirm}
          onClose={() => setShowVoice(false)}
        />
      )}
    </div>
  )
}

// Sends the bill on WhatsApp; the function looks up the bill from the record.
async function sendBill(recordId, lang) {
  try {
    const { data } = await supabase.functions.invoke('send-whatsapp', { body: { record_id: recordId, lang } })
    return data?.whatsapp_status ?? 'failed'
  } catch {
    return 'failed' // the bill is saved; Retry is offered
  }
}

const SUBMIT_ERRORS = {
  unknown_vehicle: 'errUnknownVehicle',
  no_sessions: 'errAddSession',
  bad_sessions: 'errStopAfterStart',
  customer_not_found: 'errCustomerGone',
}

function submitErrorText(err, t) {
  const key = Object.keys(SUBMIT_ERRORS).find((k) => (err?.message ?? '').includes(k))
  return key ? t(SUBMIT_ERRORS[key]) : (err?.message || t('submitFailed'))
}

// After Finish (kisan-design/screens/4-bill-sent.html): the bill as the
// database worked it out, and whether it reached the customer on WhatsApp.
function BillSent({ customer, role, record, whatsapp_status, sessionCount, onRetry, onDone }) {
  const { t } = useTrans()
  const [paid, setPaid] = useState(false)
  const [payError, setPayError] = useState('')
  const sent = whatsapp_status === 'sent'
  const sending = whatsapp_status === 'sending'
  const date = new Date(record.created_at ?? Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  async function markPaid() {
    setPayError('')
    setPaid(true)
    const { error } = await supabase.from('customers').update({ is_paid: true }).eq('id', customer.id)
    if (error) { setPaid(false); setPayError(error.message) }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-5 pb-5 pt-10">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className={`mb-2 flex h-16 w-16 items-center justify-center rounded-full ${sent || sending ? 'bg-mint-100 text-primary' : 'bg-due-bg text-due'}`}>
            {sent || sending
              ? <Check size={34} strokeWidth={3} aria-hidden="true" />
              : <Wallet size={30} strokeWidth={2.4} aria-hidden="true" />}
          </span>
          <h1 className="text-[24px] font-extrabold leading-[1.15] tracking-[-0.5px]">
            {sent ? t('billSentTitle') : sending ? t('sendingWaLabel') : t('billSavedTitle')}
          </h1>
          <p className="text-[15px] font-medium text-muted">{customer.name}</p>
        </div>

        <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-divider px-[18px] py-3">
            <span className="text-base font-extrabold">{t('bill')}</span>
            <span className="text-[13px] font-semibold text-muted">{date} · {record.vehicle_type}</span>
          </div>
          <div className="flex flex-col gap-2 px-[18px] py-3 text-[15px]">
            <Line label={t('workSessions')} value={sessionCount} />
            <Line label={t('totalTime')} value={formatHours(record.total_hours)} />
            <Line label={t('rate')} value={t('ratePerHour', { rate: formatMoney(record.hourly_rate) })} />
          </div>
          <div className="flex items-center justify-between bg-mint-50 px-[18px] py-3.5 text-primary">
            <span className="text-base font-extrabold">{t('total')}</span>
            <span className="text-[28px] font-extrabold leading-none tracking-[-0.8px]">{formatMoney(record.amount)}</span>
          </div>
        </div>

        {!sent && !sending && (
          <div role="alert" className="flex items-center gap-3 rounded-[18px] bg-due-bg px-4 py-3">
            <p className="flex-1 text-sm font-semibold text-due">{role === 'driver' ? t('billNotSentDriver') : t('billNotSentOwner')}</p>
            <button onClick={onRetry} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-surface px-3 text-sm font-bold text-due">
              <RotateCw size={16} strokeWidth={2.6} aria-hidden="true" />
              {t('retryShort')}
            </button>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2.5 pt-2">
          {role === 'owner' && (
            <SecondaryButton onClick={markPaid} disabled={paid}>
              {paid ? <Check size={18} strokeWidth={2.6} aria-hidden="true" /> : <Wallet size={18} strokeWidth={2.2} aria-hidden="true" />}
              {paid ? t('markedPaid') : t('gotCashNow')}
            </SecondaryButton>
          )}
          {payError && <p role="alert" className="text-center text-sm font-semibold text-danger">{payError}</p>}
          <PrimaryButton onClick={onDone}>{t('done')}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="font-medium text-muted">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  )
}
