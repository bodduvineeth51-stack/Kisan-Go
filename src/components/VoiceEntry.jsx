import { useState, useRef, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import { parseTranscript } from '../lib/voiceParser'
import { Check, Globe, Mic, Square, X } from 'lucide-react'
import { useTrans } from '../context/LangContext'

const isNative = Capacitor.isNativePlatform()

function isoToTimeStr(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function VoiceEntry({ customer, vehicleTypes, onConfirm, onClose }) {
  const { t, lang: appLang } = useTrans()
  const supported = isNative || !!(window.SpeechRecognition || window.webkitSpeechRecognition)
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

  useEffect(() => () => {
    recRef.current?.abort()
    if (isNative) SpeechRecognition.stop().catch(() => {})
  }, [])

  function handleFinal(text) {
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

  // The Android app's WebView has no Web Speech API, so the app uses the
  // phone's own speech recognizer through a Capacitor plugin instead.
  async function startNativeListening() {
    try {
      const { speechRecognition } = await SpeechRecognition.requestPermissions()
      if (speechRecognition !== 'granted') { setMicError(t('micPermDenied')); return }
      setPhase('listening')
      const { matches } = await SpeechRecognition.start({
        language: speechLang,
        maxResults: 1,
        partialResults: false,
        popup: false,
      })
      const text = matches?.[0]?.trim()
      if (text) handleFinal(text)
      else { setPhase('idle'); setMicError(t('noSpeechErr')) }
    } catch (err) {
      setPhase('idle')
      setMicError(t('micErr', { code: err?.message ?? 'unknown' }))
    }
  }

  function startListening() {
    setMicError('')
    setHeardText('')
    setInterim('')
    setParsed(null)
    gotFinal.current = false

    if (isNative) { startNativeListening(); return }

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
      if (finalAcc.trim()) handleFinal(finalAcc.trim())
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

  function stopListening() {
    if (isNative) SpeechRecognition.stop().catch(() => {})
    else recRef.current?.stop()
  }

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

  const timeInput = (value, set, label) => (
    <input
      type="time"
      aria-label={label}
      value={value}
      onChange={e => set(e.target.value)}
      className={`h-11 rounded-xl border-2 px-2 text-base font-bold text-ink outline-none focus:border-primary-bright ${
        value ? 'border-border bg-surface' : 'border-due-bar bg-due-bg'
      }`}
    />
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('voiceEntryTitle')}
        className="mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[26px] bg-surface px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border" />

        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[22px] font-extrabold tracking-[-0.5px] text-ink">{t('voiceEntryTitle')}</h2>
          <div className="flex items-center gap-2">
            {/* Speech language — separate from the app display language */}
            <div className="flex h-11 items-center gap-1 rounded-[22px] bg-mint-50 p-1">
              {[['en-IN', 'EN'], ['te-IN', 'తె']].map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => setSpeechLang(code)}
                  aria-pressed={speechLang === code}
                  className={`h-9 rounded-[18px] px-3 text-sm ${
                    speechLang === code ? 'bg-primary font-extrabold text-white' : 'font-semibold text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              aria-label={t('close')}
              className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-mint-50 text-ink"
            >
              <X size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Unsupported browser */}
          {!supported && (
            <div className="flex flex-col items-center gap-2 rounded-[18px] bg-amber-bg px-5 py-6 text-center">
              <Globe size={36} strokeWidth={2} className="text-amber" aria-hidden="true" />
              <p className="text-base font-extrabold text-amber">{t('chromeRequired')}</p>
              <p className="text-sm font-medium text-amber">{t('chromeMsg')}</p>
            </div>
          )}

          {supported && (
            <>
              {/* Job context */}
              <div className="flex items-center gap-2 rounded-2xl bg-mint-50 px-4 py-2.5">
                <span className="text-sm font-medium text-muted">{t('jobFor')}</span>
                <span className="text-base font-bold text-ink">{customer.name}</span>
              </div>

              {phase !== 'done' && !heardText && (
                <div className="text-center">
                  <p className="text-sm font-medium text-muted">{t('voiceHint')}</p>
                  <p className="mt-1 text-sm font-bold text-ink">{t('voiceExample')}</p>
                </div>
              )}

              {/* Mic button */}
              <div className="flex justify-center py-2">
                <button
                  onClick={phase === 'listening' ? stopListening : startListening}
                  className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white transition-transform active:scale-95 ${
                    phase === 'listening' ? 'bg-danger shadow-danger' : 'bg-primary shadow-green'
                  }`}
                  aria-label={phase === 'listening' ? t('stopListening') : t('startListening')}
                >
                  {phase === 'listening'
                    ? <Square size={30} fill="currentColor" aria-hidden="true" />
                    : <Mic size={40} strokeWidth={2.2} aria-hidden="true" />}
                  {phase === 'listening' && (
                    <span className="absolute -inset-1 animate-ping rounded-full bg-danger opacity-30" />
                  )}
                </button>
              </div>

              {phase === 'listening' && (
                <p className="animate-pulse text-center text-sm font-bold text-danger">{t('listeningLabel')}</p>
              )}
              {phase === 'done' && (
                <p className="text-center text-xs font-semibold text-muted">{t('tapToReRecord')}</p>
              )}

              {interim && (
                <p className="rounded-2xl bg-mint-50 px-4 py-3 text-sm italic text-muted">{interim}…</p>
              )}

              {micError && (
                <p role="alert" className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-danger">{micError}</p>
              )}

              {/* Result + editable fields */}
              {phase === 'done' && heardText && (
                <div className="flex flex-col gap-3">
                  <div className="rounded-2xl bg-mint-50 px-4 py-3">
                    <p className="mb-1 text-xs font-extrabold text-muted">{t('heardLabel')}</p>
                    <p className="text-sm font-semibold text-ink">"{heardText}"</p>
                  </div>

                  {parsed?.customer && parsed.customer.id !== customer.id && (
                    <p className="rounded-2xl bg-amber-bg px-4 py-3 text-sm font-semibold text-amber">
                      {t('customerMismatch', { heard: parsed.customer.name, customer: customer.name })}
                    </p>
                  )}

                  <div className="overflow-hidden rounded-[22px] bg-surface shadow-card">
                    <p className="border-b border-divider px-4 py-3 text-sm font-extrabold text-ink">{t('confirmEditLabel')}</p>
                    <div className="border-b border-divider px-4 py-3">
                      <p className="mb-2 text-xs font-bold text-muted">{t('vehicleLabel')}</p>
                      <div className="flex flex-wrap gap-2">
                        {vehicleTypes.map(v => {
                          const on = confirmVehicle?.type === v.type
                          return (
                            <button
                              key={v.type}
                              onClick={() => setConfirmVehicle(v)}
                              aria-pressed={on}
                              className={`min-h-11 rounded-2xl border-2 px-3.5 text-sm ${
                                on ? 'border-primary-bright bg-mint-100 font-extrabold text-primary' : 'border-border bg-field font-semibold text-ink'
                              }`}
                            >
                              {v.type}
                            </button>
                          )
                        })}
                      </div>
                      {!parsed?.vehicle && (
                        <p className="mt-2 text-xs font-semibold text-due">{t('vehicleNotDetected')}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-b border-divider px-4 py-2.5">
                      <p className="text-sm font-bold text-ink">{t('startTimeLabel')}</p>
                      {timeInput(startTime, setStartTime, t('startTimeLabel'))}
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <p className="text-sm font-bold text-ink">{t('stopTimeLabel')}</p>
                      {timeInput(stopTime, setStopTime, t('stopTimeLabel'))}
                    </div>
                    {(!parsed?.start || !parsed?.stop) && (
                      <p className="px-4 pb-3 text-xs font-semibold text-due">{t('timeNotDetected')}</p>
                    )}
                  </div>

                  {startTime && stopTime && !timeValid && (
                    <p className="text-center text-sm font-semibold text-danger">{t('stopAfterStartWarn')}</p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={onClose}
                  className="min-h-[58px] flex-1 rounded-[18px] bg-mint-50 text-base font-bold text-ink"
                >
                  {t('cancel')}
                </button>
                {phase === 'done' && (
                  <button
                    onClick={handleConfirm}
                    disabled={!timeValid || !confirmVehicle}
                    className="flex min-h-[58px] flex-1 items-center justify-center gap-2 rounded-[18px] bg-primary text-base font-extrabold text-white shadow-green active:scale-[0.98] disabled:opacity-40"
                  >
                    <Check size={20} strokeWidth={3} aria-hidden="true" />
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
