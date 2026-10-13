import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import VoiceEntry from '../components/VoiceEntry'
import BillReady from '../components/BillReady'
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

export default function TimerScreen({ customer, owner, onComplete, onBack }) {
  const { t } = useTrans()
  const autoVehicle = owner.vehicle_rates.length === 1 ? owner.vehicle_rates[0] : null
  const [vehicle, setVehicle] = useState(autoVehicle)
  const [sessions, setSessions] = useState([])
  const [activeStart, setActiveStart] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [showManual, setShowManual] = useState(false)
  const [showVoice, setShowVoice] = useState(false)
  const [manualStart, setManualStart] = useState('')
  const [manualStop, setManualStop] = useState('')
  const [manualError, setManualError] = useState('')
  const [submitPhase, setSubmitPhase] = useState(null)
  const [savedRecord, setSavedRecord] = useState(null)
  const [error, setError] = useState('')

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

    const { totalHours } = calcTotals(sessions)
    const roundedHours = Math.round(totalHours * 100) / 100
    const amount = Math.round(totalHours * vehicle.hourly_rate)

    setSubmitPhase('saving')
    const { data, error } = await supabase
      .from('work_records')
      .insert({
        customer_id: customer.id,
        owner_id: owner.id,
        vehicle_type: vehicle.type,
        hourly_rate: vehicle.hourly_rate,
        sessions,
        total_hours: roundedHours,
        amount,
        whatsapp_status: 'pending',
      })
      .select()
      .single()

    if (error) { setError(error.message); setSubmitPhase(null); return }

    setSavedRecord(data)
  }

  // The bill counts as sent once the owner opens the WhatsApp chat
  function handleBillSent(record) {
    setSavedRecord({ ...record, whatsapp_status: 'sent' })
    supabase
      .from('work_records')
      .update({ whatsapp_status: 'sent' })
      .eq('id', record.id)
      .then(({ error }) => { if (error) console.error('[bill] status update failed:', error) })
  }

  const { totalMins, totalHours } = calcTotals(sessions)
  const isRecording = activeStart !== null
  const canSubmit = sessions.length > 0 && !isRecording && vehicle && submitPhase === null

  if (savedRecord) {
    return (
      <BillReady
        customer={customer}
        record={savedRecord}
        onSent={handleBillSent}
        onDone={() => onComplete(savedRecord)}
      />
    )
  }

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
        {owner.vehicle_rates.length > 1 ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">{t('selectVehicleTitle')}</p>
            <div className="flex flex-wrap gap-2">
              {owner.vehicle_rates.map((v) => (
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
              {owner.vehicle_rates[0].type}
              <span className="ml-2 font-normal text-green-600">
                ₹{owner.vehicle_rates[0].hourly_rate}/{t('hrShort')}
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
          disabled={!vehicle}
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
              {submitPhase === 'saving' ? t('savingLabel') : t('submitJob')}
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
          vehicleTypes={owner.vehicle_rates}
          onConfirm={handleVoiceConfirm}
          onClose={() => setShowVoice(false)}
        />
      )}
    </div>
  )
}
