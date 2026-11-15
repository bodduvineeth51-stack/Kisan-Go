import { useState, useRef, useEffect } from 'react'
import { Mic, Square, X, Globe } from 'lucide-react'
import { parseTranscript } from '../lib/voiceParser'
import { isSpeechSupported, listenOnce, speechErrorMessage } from '../lib/speech'
import { useTrans } from '../context/LangContext'

function isoToTimeStr(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Driver says the vehicle and time; we show what was understood for
// checking and editing. Never adds anything without the Add button.
export default function VoiceEntry({ customer, vehicleTypes, onConfirm, onClose }) {
  const { t, lang: appLang } = useTrans()
  const supported = isSpeechSupported()
  // speechLang is for the mic — defaults to match the app display language
  const [speechLang, setSpeechLang] = useState(appLang === 'te' ? 'te-IN' : 'en-IN')
  const [phase, setPhase]           = useState('idle') // 'idle' | 'listening' | 'done'
  const [interim, setInterim]       = useState('')
  const [heardText, setHeardText]   = useState('')
  const [parsed, setParsed]         = useState(null)
  const [confirmVehicle, setConfirmVehicle] = useState(vehicleTypes[0] ?? null)
  const [startTime, setStartTime]   = useState('')
  const [stopTime,  setStopTime]    = useState('')
  const [micError,  setMicError]    = useState('')
  const listenRef = useRef(null)

  useEffect(() => () => listenRef.current?.stop(), [])

  async function startListening() {
    setMicError('')
    setHeardText('')
    setInterim('')
    setParsed(null)
    const session = listenOnce({
      lang: speechLang,
      onStart: () => setPhase('listening'),
      onInterim: setInterim,
    })
    listenRef.current = session
    try {
      const text = await session.result
      setHeardText(text)
      setInterim('')
      const result = parseTranscript(text, [customer], vehicleTypes)
      setParsed(result)
      setConfirmVehicle(result.vehicle ?? vehicleTypes[0] ?? null)
      setStartTime(isoToTimeStr(result.start))
      setStopTime(isoToTimeStr(result.stop))
      setPhase('done')
    } catch (err) {
      setPhase('idle')
      setInterim('')
      setMicError(speechErrorMessage(err, t))
    }
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

  const timeInput = (value, set) => (
    <input
      type="time"
      value={value}
      onChange={(e) => set(e.target.value)}
      className={`h-11 rounded-xl border-2 px-2 text-base font-semibold outline-none focus:border-primary-bright ${
        value ? 'border-border bg-surface' : 'border-due-bar bg-due-bg'
      }`}
    />
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-ink/60" onClick={onClose}>
      <div
        className="mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[26px] bg-bg pb-[calc(24px+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-[22px] font-extrabold tracking-[-0.5px]">{t('voiceEntryTitle')}</h2>
          <div className="flex items-center gap-2">
            {/* Speech language — separate from the app display language */}
            <div className="flex gap-1 rounded-2xl bg-surface p-1 shadow-card">
              {[['en-IN', 'EN'], ['te-IN', 'తె']].map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => setSpeechLang(code)}
                  aria-pressed={speechLang === code}
                  className={`h-9 min-w-11 rounded-xl px-2 text-sm font-bold ${
                    speechLang === code ? 'bg-primary text-white' : 'text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              aria-label={t('close')}
              className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-surface text-ink shadow-card"
            >
              <X size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5">
          {!supported && (
            <div className="rounded-[18px] bg-amber-bg px-5 py-6 text-center">
              <Globe size={36} strokeWidth={2} className="mx-auto mb-2 text-amber" aria-hidden="true" />
              <p className="font-bold text-amber">{t('chromeRequired')}</p>
              <p className="mt-1 text-sm font-medium text-amber">{t('chromeMsg')}</p>
            </div>
          )}

          {supported && (
            <>
              <div className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-2.5 shadow-card">
                <span className="text-sm font-medium text-muted">{t('jobFor')}</span>
                <span className="font-bold">{customer.name}</span>
              </div>

              {phase !== 'done' && !heardText && (
                <div className="text-center">
                  <p className="text-sm font-medium text-muted">{t('voiceHint')}</p>
                  <p className="mt-1 text-sm font-bold">{t('voiceExample')}</p>
                </div>
              )}

              {/* Mic */}
              <div className="flex justify-center py-1">
                <button
                  onClick={phase === 'listening' ? () => listenRef.current?.stop() : startListening}
                  aria-label={phase === 'listening' ? t('stopListening') : t('startListening')}
                  className={`relative flex h-24 w-24 items-center justify-center rounded-full text-white transition-transform active:scale-90 ${
                    phase === 'listening'
                      ? 'bg-danger shadow-[0_10px_22px_rgba(220,38,38,0.3)]'
                      : 'bg-primary shadow-green'
                  }`}
                >
                  {phase === 'listening'
                    ? <Square size={32} fill="currentColor" strokeWidth={0} aria-hidden="true" />
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
                <p className="rounded-2xl bg-surface px-4 py-3 text-sm italic text-muted shadow-card">{interim}…</p>
              )}

              {micError && (
                <p className="rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-danger shadow-card">{micError}</p>
              )}

              {phase === 'done' && heardText && (
                <div className="flex flex-col gap-3">
                  <div className="rounded-2xl bg-surface px-4 py-3 shadow-card">
                    <p className="mb-1 text-xs font-extrabold uppercase tracking-wider text-muted">{t('heardLabel')}</p>
                    <p className="text-sm font-medium">"{heardText}"</p>
                  </div>

                  {parsed?.customer && parsed.customer.id !== customer.id && (
                    <p className="rounded-2xl bg-amber-bg px-4 py-3 text-sm font-semibold text-amber">
                      {t('customerMismatch', { heard: parsed.customer.name, customer: customer.name })}
                    </p>
                  )}

                  <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
                    <p className="border-b border-divider px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-muted">
                      {t('confirmEditLabel')}
                    </p>
                    <div className="border-b border-divider px-4 py-3">
                      <p className="mb-2 text-sm font-bold text-muted">{t('vehicleLabel')}</p>
                      <div className="flex flex-wrap gap-2">
                        {vehicleTypes.map((v) => (
                          <button
                            key={v.type}
                            onClick={() => setConfirmVehicle(v)}
                            aria-pressed={confirmVehicle?.type === v.type}
                            className={`h-11 rounded-2xl border-2 px-4 text-sm font-bold ${
                              confirmVehicle?.type === v.type
                                ? 'border-primary-bright bg-mint-100 text-primary'
                                : 'border-border bg-surface text-ink'
                            }`}
                          >
                            {v.type}
                          </button>
                        ))}
                      </div>
                      {!parsed?.vehicle && (
                        <p className="mt-2 text-xs font-semibold text-due">{t('vehicleNotDetected')}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-b border-divider px-4 py-2">
                      <p className="text-sm font-bold">{t('startTimeLabel')}</p>
                      {timeInput(startTime, setStartTime)}
                    </div>
                    <div className="flex items-center justify-between px-4 py-2">
                      <p className="text-sm font-bold">{t('stopTimeLabel')}</p>
                      {timeInput(stopTime, setStopTime)}
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

              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={onClose}
                  className="h-[58px] flex-1 rounded-[18px] bg-surface text-base font-bold text-ink shadow-card"
                >
                  {t('cancel')}
                </button>
                {phase === 'done' && (
                  <button
                    onClick={handleConfirm}
                    disabled={!timeValid || !confirmVehicle}
                    className="h-[58px] flex-[2] rounded-[18px] bg-primary text-base font-extrabold text-white shadow-green disabled:opacity-40 disabled:shadow-none"
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
