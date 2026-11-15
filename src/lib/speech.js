import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'

// One place for "listen once and give me the text", shared by voice entry
// on the timer and voice search on the customers list.
// On the web it uses the Web Speech API (Chrome). The Android app's WebView
// has no Web Speech API, so there it uses the phone's own recognizer.

export const isNative = Capacitor.isNativePlatform()

export function isSpeechSupported() {
  return isNative || !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

// Error codes: 'not-allowed', 'no-speech', 'network', 'start-failed', or the
// browser's own code.
function speechError(code) {
  const err = new Error(code)
  err.code = code
  return err
}

// Start listening in `lang` ('en-IN' | 'te-IN').
// Returns { result: Promise<string>, stop() }. onInterim gets live text on
// the web; the native recognizer only returns the final text.
export function listenOnce({ lang, onInterim = () => {}, onStart = () => {} }) {
  if (isNative) {
    const result = (async () => {
      const { speechRecognition } = await SpeechRecognition.requestPermissions()
      if (speechRecognition !== 'granted') throw speechError('not-allowed')
      onStart()
      const { matches } = await SpeechRecognition.start({
        language: lang,
        maxResults: 1,
        partialResults: false,
        popup: false,
      })
      const text = matches?.[0]?.trim()
      if (!text) throw speechError('no-speech')
      return text
    })()
    return { result, stop: () => SpeechRecognition.stop().catch(() => {}) }
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  const rec = new SR()
  rec.lang = lang
  rec.continuous = false
  rec.interimResults = true
  rec.maxAlternatives = 1

  const result = new Promise((resolve, reject) => {
    let done = false
    rec.onstart = onStart
    rec.onresult = (e) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      if (interim) onInterim(interim)
      if (final.trim()) { done = true; resolve(final.trim()) }
    }
    rec.onerror = (e) => { done = true; reject(speechError(e.error)) }
    rec.onend = () => { if (!done) reject(speechError('no-speech')) }
    try { rec.start() } catch { reject(speechError('start-failed')) }
  })
  return { result, stop: () => rec.stop(), abort: () => rec.abort() }
}

// Turn an error code into a translated message.
export function speechErrorMessage(err, t) {
  const msgs = {
    'not-allowed':  t('micPermDenied'),
    'no-speech':    t('noSpeechErr'),
    'network':      t('networkErr'),
    'start-failed': t('micFail'),
  }
  return msgs[err?.code] ?? t('micErr', { code: err?.code ?? err?.message ?? 'unknown' })
}
