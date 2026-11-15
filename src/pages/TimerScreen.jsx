import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { driverRpc, AccessRemovedError } from '../lib/roles'
import { formatMoney, formatHours } from '../lib/format'
import VoiceEntry from '../components/VoiceEntry'
import { useTrans } from '../context/LangContext'

function localDatetimeValue(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}

function formatElapsed(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function sessionDuration(session, t) {
  const mins = Math.ceil((new Date(session.stop) - new Date(session.start)) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0 && m > 0) return `${h} ${t('hrShort')} ${m} min`
  if (h > 0) return `${h} ${t('hrShort')}`
  return `${mins} min`
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function calcTotals(sessions) {
  const totalMins = sessions.reduce(
    (sum, s) => sum + Math.ceil((new Date(s.stop) - new Date(s.start)) / 60000),
    0,
  )
  return { totalMins, totalHours: totalMins / 60 }
}

// Used by owners and drivers. Hours and amount are always worked out by the
// database (Phase 2 submit_work_record) from the sessions and the owner's rate
// for that vehicle; the numbers shown here before Submit are only a preview.
//
// role 'driver': after Submit, shows the amount of the job just submitted, and
// calls onAccessRemoved if the owner has revoked this driver.
export default function TimerScreen({
  customer,
  vehicleRates = [],
  onComplete,
  onBack,
  role = 'owner',
  onAccessRemoved = () => {},
}) {
  const { t, lang } = useTrans()
  const autoVehicle = vehicleRates.length === 1 ? vehicleRates[0] : null
  const [selectedVehicle, setVehicle] = useState(autoVehicle)
  const vehicle = vehicleRates.find(v => v.type === selectedVehicle?.type) ?? null
  const [sessions, setSessions] = useState([])
  const [activeStart, setActiveStart] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [showManual, setShowManual] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [manualStart, setManualStart] = useState('')
  const [manualStop, setManualStop] = useState('')
  const [manualError, setManualError] = useState('')
  const [submitPhase, setSubmitPhase] = useState(null)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(null) // driver: { record, whatsapp_status }

  useEffect(() => {
    if (!activeStart) return
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - activeStart.getTime()) / 1000)),
      1000,
    )
    return () => clearInterval(id)
  }, [activeStart])

  function handleStart() { setActiveStart(new Date()); setElapsed(0) }

  function handleStop() {
    if (!activeStart) return
    setSessions((prev) => [
      ...prev,
      { start: activeStart.toISOString(), stop: new Date().toISOString() },
    ])
    setActiveStart(null)
    setElapsed(0)
  }

  function openManual() {
    setManualStart(localDatetimeValue())
    setManualStop(localDatetimeValue())
    setManualError('')
    setShowManual(true)
  }

  function handleAddManual() {
    if (!manualStart || !manualStop) { setManualError(t('errPickTimes')); return }
    const s = new Date(manualStart)
    const e = new Date(manualStop)
    if (isNaN(s) || isNaN(e)) { setManualError(t('errInvalidDate')); return }
    if (e <= s) { setManualError(t('errStopAfterStart')); return }
    setSessions((prev) => [...prev, { start: s.toISOString(), stop: e.toISOString() }])
    setShowManual(false)
  }

  function removeSession(idx) {
    setSessions((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleVoiceConfirm({ vehicle: parsedVehicle, session }) {
    if (parsedVehicle) setVehicle(parsedVehicle)
    if (session?.start && session?.stop) {
      setSessions((prev) => [...prev, session])
    }
    setShowVoice(false)
  }

  async function handleSubmit() {
    setError('')
    if (!vehicle) { setError(t('errSelectVehicle')); return }
    if (sessions.length === 0) { setError(t('errAddSession')); return }
    if (activeStart) { setError(t('errStopFirst')); return }

    setSubmitPhase('saving')
    let record
    try {
      const rows = await driverRpc('submit_work_record', {
        p_customer_id: customer.id,
        p_vehicle_type: vehicle.type,
        p_sessions: sessions,
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
    let whatsapp_status = 'failed'
    try {
      // The function looks up the bill (customer, hours, amount) itself.
      const { data } = await supabase.functions.invoke('send-whatsapp', {
        body: { record_id: record.id, lang },
      })
      whatsapp_status = data?.whatsapp_status ?? 'failed'
    } catch {
      // WhatsApp failed — record is saved; the owner can retry from the dashboard
    }

    if (role === 'driver') {
      setSubmitPhase(null)
      setSubmitted({ record, whatsapp_status })
      return
    }
    onComplete(record)
  }

  if (submitted) {
    return <SubmittedView customer={customer} {...submitted} onDone={() => onComplete(submitted.record)} />
  }

  const { totalMins, totalHours } = calcTotals(sessions)
  const isRecording = activeStart !== null
  const canSubmit = sessions.length > 0 && !isRecording && vehicle

  return (
    <div className="flex min-h-svh flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-green-600 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full text-green-100 hover:bg-green-700 text-xl"
            aria-label="Back"
          >
            ←
          </button>
          <div className="flex-1">
            <p className="text-xs text-green-100">{t('jobFor')}</p>
            <h1 className="font-bold leading-tight">{customer.name}</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5 pb-10">

        {/* Vehicle selector */}
        {vehicleRates.length === 0 ? (
          <p className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-due">{t('noVehicles')}</p>
        ) : vehicleRates.length > 1 ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">{t('selectVehicleTitle')}</p>
            <div className="flex flex-wrap gap-2">
              {vehicleRates.map((v) => (
                <button
                  key={v.type}
                  onClick={() => setVehicle(v)}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
                    vehicle?.type === v.type
                      ? 'bg-green-600 text-white shadow'
                      : 'border border-gray-300 bg-white text-gray-700 hover:border-green-500'
                  }`}
                >
                  {v.type}
                  <span className="ml-1 text-xs opacity-75">₹{v.hourly_rate}/{t('hrShort')}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-green-50 px-4 py-3">
            <p className="text-sm font-semibold text-green-800">
              {vehicleRates[0].type}
              <span className="ml-2 font-normal text-green-600">
                ₹{vehicleRates[0].hourly_rate}/{t('hrShort')}
              </span>
            </p>
          </div>
        )}

        {/* Live elapsed counter */}
        {isRecording && (
          <div className="rounded-2xl bg-orange-50 py-5 text-center ring-2 ring-orange-200">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              {t('recordingLabel')}
            </p>
            <p className="mt-2 font-mono text-6xl font-black tabular-nums text-orange-600">
              {formatElapsed(elapsed)}
            </p>
          </div>
        )}

        {/* BIG START / STOP */}
        <button
          onClick={isRecording ? handleStop : handleStart}
          disabled={!vehicle || submitPhase !== null}
          className={`w-full rounded-3xl py-10 text-3xl font-black tracking-wide shadow-xl transition-transform active:scale-95 disabled:opacity-40 disabled:shadow-none ${
            isRecording
              ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-200'
              : 'bg-green-600 text-white hover:bg-green-700 shadow-green-200'
          }`}
        >
          {isRecording ? t('stopBtn') : t('startBtn')}
        </button>
        {!vehicle && (
          <p className="text-center text-xs text-gray-400">{t('vehicleHint')}</p>
        )}

        {/* Sessions list */}
        {sessions.length > 0 && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-700">
                {sessions.length === 1
                  ? t('sessionCount', { n: 1 })
                  : t('sessionCountPlural', { n: sessions.length })}
              </p>
              <p className="text-sm font-semibold text-green-700">
                {totalHours >= 1
                  ? t('totalHrs', { h: totalHours.toFixed(2) })
                  : t('totalMin', { m: Math.round(totalMins) })}
              </p>
            </div>
            <ul className="divide-y divide-gray-100">
              {sessions.map((s, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">{fmtTime(s.start)}</span>
                    <span className="mx-1.5 text-gray-400">→</span>
                    <span className="font-medium">{fmtTime(s.stop)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-gray-800">
                      {sessionDuration(s, t)}
                    </span>
                    <button
                      onClick={() => removeSession(i)}
                      aria-label="Remove session"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Manual / Voice session buttons */}
        {!showManual && (
          <div className="flex items-center gap-5">
            <button
              onClick={openManual}
              className="text-sm font-medium text-green-600 hover:text-green-700"
            >
              {t('addManually')}
            </button>
            <button
              onClick={() => setShowVoice(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-green-600 hover:text-green-700"
            >
              {t('addByVoice')}
            </button>
          </div>
        )}

        {/* Manual session form */}
        {showManual && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">{t('manualSessionTitle')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">{t('startLabel')}</label>
                <input
                  type="datetime-local"
                  value={manualStart}
                  onChange={(e) => setManualStart(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">{t('stopLabel')}</label>
                <input
                  type="datetime-local"
                  value={manualStop}
                  onChange={(e) => setManualStop(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
                />
              </div>
            </div>
            {manualError && <p className="mt-2 text-xs text-red-600">{manualError}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setShowManual(false)}
                className="flex-1 rounded-xl border border-gray-300 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleAddManual}
                className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
              >
                {t('save')}
              </button>
            </div>
          </div>
        )}

        {/* Submit block */}
        {canSubmit && (
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 text-center">
              <p className="text-sm text-gray-500">
                {totalHours.toFixed(2)} {t('hrShort')} × ₹{vehicle.hourly_rate}/{t('hrShort')}
              </p>
              <p className="mt-1 text-4xl font-black text-gray-900">
                ₹{Math.round(totalHours * vehicle.hourly_rate).toLocaleString('en-IN')}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">{vehicle.type}</p>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitPhase !== null}
              className="w-full rounded-2xl bg-green-600 py-5 text-lg font-extrabold text-white shadow-md transition-transform active:scale-95 disabled:opacity-60 hover:bg-green-700"
            >
              {submitPhase === 'saving'
                ? t('savingLabel')
                : submitPhase === 'sending'
                  ? t('sendingWaLabel')
                  : t('submitJob')}
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        )}
      </div>

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

// Driver's confirmation after Submit: the amount the database worked out.
function SubmittedView({ customer, record, whatsapp_status, onDone }) {
  const { t } = useTrans()
  const sent = whatsapp_status === 'sent'
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-[26px] bg-surface p-6 text-center shadow-card">
        <p className="text-sm font-bold uppercase tracking-widest text-primary">{t('jobSubmitted')}</p>
        <p className="mt-1 text-lg font-bold text-ink">{customer.name}</p>
        <p className="mt-3 text-[44px] font-extrabold leading-none tracking-[-1.5px] text-ink">
          {formatMoney(record.amount)}
        </p>
        <p className="mt-2 text-sm font-medium text-muted">
          {record.vehicle_type} · {formatHours(record.total_hours)} × ₹{record.hourly_rate}/{t('hrShort')}
        </p>
        <p className={`mt-4 inline-block rounded-lg px-2.5 py-1 text-sm font-bold ${sent ? 'bg-mint-100 text-primary' : 'bg-due-bg text-due'}`}>
          {sent ? t('whatsappSent') : t('billNotSentDriver')}
        </p>
        <button
          onClick={onDone}
          className="mt-6 min-h-14 w-full rounded-2xl bg-primary text-lg font-extrabold text-white shadow-green active:scale-[0.98]"
        >
          {t('done')}
        </button>
      </div>
    </div>
  )
}
