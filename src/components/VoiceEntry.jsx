import { useState, useRef, useEffect } from 'react'
import { parseTranscript } from '../lib/voiceParser'
import { useTrans } from '../context/LangContext'

function isoToTimeStr(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function VoiceEntry({ customer, vehicleTypes, onConfirm, onClose }) {
  const { t, lang: appLang } = useTrans()
  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  // speechLang is for the mic — defaults to match the app display language
  const [speechLang, setSpeechLang] = useState(appLang === 'te' ? 'te-IN' : 'en-IN')
  const [phase, setPhase]           = useState('idle')
  const [interim, setInterim]       = useState('')
  const [heardText, setHeardText]   = useState('')
  const [parsed, setParsed]         = useState(null)
  const [confirmVehicle, setConfirmVehicle] = useState(vehicleTypes[0] ?? null)
  const [startTime, setStartTime]   = useState('')
  const [stopTime,  setStopTime]    = useState('')
  const [micError,  setMicError]    = useState('')
  const recRef   = useRef(null)
  const gotFinal = useRef(false)

  useEffect(() => () => recRef.current?.abort(), [])

  function startListening() {
    setMicError('')
    setHeardText('')
    setInterim('')
    setParsed(null)
    gotFinal.current = false

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = speechLang
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => setPhase('listening')

    rec.onresult = (e) => {
      let interimAcc = ''
      let finalAcc   = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalAcc   += e.results[i][0].transcript + ' '
        else                       interimAcc += e.results[i][0].transcript
      }
      if (interimAcc) setInterim(interimAcc)
      if (finalAcc.trim()) {
        const text = finalAcc.trim()
        gotFinal.current = true
        setHeardText(text)
        setInterim('')
        const result = parseTranscript(text, [customer], vehicleTypes)
        setParsed(result)
        setConfirmVehicle(result.vehicle ?? vehicleTypes[0] ?? null)
        setStartTime(isoToTimeStr(result.start))
        setStopTime(isoToTimeStr(result.stop))
        setPhase('done')
      }
    }

    rec.onerror = (e) => {
      setPhase('idle')
      const msgs = {
        'not-allowed': t('micPermDenied'),
        'no-speech':   t('noSpeechErr'),
        'network':     t('networkErr'),
      }
      setMicError(msgs[e.error] ?? t('micErr', { code: e.error }))
    }

    rec.onend = () => { if (!gotFinal.current) setPhase('idle') }

    recRef.current = rec
    try { rec.start() } catch {
      setPhase('idle')
      setMicError(t('micFail'))
    }
  }

  function stopListening() { recRef.current?.stop() }

  const timeValid = (() => {
    if (!startTime || !stopTime) return false
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = stopTime.split(':').map(Number)
    return eh * 60 + em > sh * 60 + sm
  })()

  function handleConfirm() {
    if (!timeValid || !confirmVehicle) return
    const today = new Date()
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = stopTime.split(':').map(Number)
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm, 0)
    const stop  = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em, 0)
    onConfirm({ vehicle: confirmVehicle, session: { start: start.toISOString(), stop: stop.toISOString() } })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-white pb-10 max-h-[92dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-gray-300" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">{t('voiceEntryTitle')}</h2>
          <div className="flex items-center gap-3">
            {/* Speech language toggle — separate from the app display language */}
            <div className="flex overflow-hidden rounded-xl border border-gray-200 text-sm">
              {[['en-IN', 'EN'], ['te-IN', 'తె']].map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => setSpeechLang(code)}
                  className={`px-3 py-1.5 font-semibold transition-colors ${
                    speechLang === code ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 text-lg leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-5 px-5">

          {/* Unsupported browser */}
          {!supported && (
            <div className="rounded-2xl bg-amber-50 px-5 py-6 text-center">
              <p className="mb-2 text-4xl">🌐</p>
              <p className="font-semibold text-amber-800">{t('chromeRequired')}</p>
              <p className="mt-1 text-sm text-amber-700">{t('chromeMsg')}</p>
            </div>
          )}

          {supported && (
            <>
              {/* Job context */}
              <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-2.5">
                <span className="text-sm text-gray-400">{t('jobFor')}</span>
                <span className="font-semibold text-gray-800">{customer.name}</span>
              </div>

              {/* Hint */}
              {phase !== 'done' && !heardText && (
                <div className="text-center">
                  <p className="text-sm text-gray-500">{t('voiceHint')}</p>
                  <p className="mt-1 text-sm font-medium text-gray-700">{t('voiceExample')}</p>
                </div>
              )}

              {/* Mic button */}
              <div className="flex justify-center py-2">
                <button
                  onClick={phase === 'listening' ? stopListening : startListening}
                  className={`relative flex h-24 w-24 items-center justify-center rounded-full text-5xl shadow-lg transition-transform active:scale-90 ${
                    phase === 'listening'
                      ? 'bg-red-500 text-white shadow-red-200'
                      : 'bg-green-600 text-white shadow-green-200 hover:bg-green-700'
                  }`}
                  aria-label={phase === 'listening' ? 'Stop listening' : 'Start listening'}
                >
                  {phase === 'listening' ? '⬛' : '🎤'}
                  {phase === 'listening' && (
                    <span className="absolute -inset-1 animate-ping rounded-full bg-red-400 opacity-30" />
                  )}
                </button>
              </div>

              {phase === 'listening' && (
                <p className="animate-pulse text-center text-sm font-medium text-red-500">
                  {t('listeningLabel')}
                </p>
              )}
              {phase === 'done' && (
                <p className="text-center text-xs text-gray-400">{t('tapToReRecord')}</p>
              )}

              {interim && (
                <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm italic text-gray-400">
                  {interim}…
                </p>
              )}

              {micError && (
                <div className="rounded-xl bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-600">{micError}</p>
                </div>
              )}

              {/* Result + editable fields */}
              {phase === 'done' && heardText && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-400">
                      {t('heardLabel')}
                    </p>
                    <p className="text-sm text-gray-700">"{heardText}"</p>
                  </div>

                  {parsed?.customer && parsed.customer.id !== customer.id && (
                    <div className="rounded-xl bg-amber-50 px-4 py-3">
                      <p className="text-sm text-amber-700">
                        {t('customerMismatch', { heard: parsed.customer.name, customer: customer.name })}
                      </p>
                    </div>
                  )}

                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                        {t('confirmEditLabel')}
                      </p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {/* Vehicle */}
                      <div className="px-4 py-3">
                        <p className="mb-2 text-xs text-gray-500">{t('vehicleLabel')}</p>
                        <div className="flex flex-wrap gap-2">
                          {vehicleTypes.map(v => (
                            <button
                              key={v.type}
                              onClick={() => setConfirmVehicle(v)}
                              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                                confirmVehicle?.type === v.type
                                  ? 'bg-green-600 text-white'
                                  : 'border border-gray-300 text-gray-700 hover:border-green-500'
                              }`}
                            >
                              {v.type}
                            </button>
                          ))}
                        </div>
                        {!parsed?.vehicle && (
                          <p className="mt-2 text-xs text-amber-600">{t('vehicleNotDetected')}</p>
                        )}
                      </div>

                      {/* Start time */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <p className="text-sm text-gray-700">{t('startTimeLabel')}</p>
                        <input
                          type="time"
                          value={startTime}
                          onChange={e => setStartTime(e.target.value)}
                          className={`rounded-lg border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-green-600 ${
                            startTime ? 'border-gray-300' : 'border-amber-400 bg-amber-50'
                          }`}
                        />
                      </div>

                      {/* Stop time */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <p className="text-sm text-gray-700">{t('stopTimeLabel')}</p>
                        <input
                          type="time"
                          value={stopTime}
                          onChange={e => setStopTime(e.target.value)}
                          className={`rounded-lg border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-green-600 ${
                            stopTime ? 'border-gray-300' : 'border-amber-400 bg-amber-50'
                          }`}
                        />
                      </div>

                      {(!parsed?.start || !parsed?.stop) && (
                        <p className="px-4 pb-3 text-xs text-amber-600">{t('timeNotDetected')}</p>
                      )}
                    </div>
                  </div>

                  {startTime && stopTime && !timeValid && (
                    <p className="text-center text-xs text-red-600">{t('stopAfterStartWarn')}</p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-2xl border border-gray-300 py-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('cancel')}
                </button>
                {phase === 'done' && (
                  <button
                    onClick={handleConfirm}
                    disabled={!timeValid || !confirmVehicle}
                    className="flex-1 rounded-2xl bg-green-600 py-4 text-sm font-bold text-white shadow-md transition-transform active:scale-95 disabled:opacity-40 hover:bg-green-700"
                  >
                    {t('addSessionBtn')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
