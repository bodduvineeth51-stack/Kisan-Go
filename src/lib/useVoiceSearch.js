import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import { useTrans } from '../context/LangContext'

const isNative = Capacitor.isNativePlatform()

// Mic button on the search bar: listens once in the app language and hands
// back what was said. Web uses the Web Speech API (Chrome); the Android app
// uses the phone's recognizer through the Capacitor plugin (as VoiceEntry).
export function useVoiceSearch(onText) {
  const { lang } = useTrans()
  const [listening, setListening] = useState(false)
  const rec = useRef(null)
  const supported = isNative || (typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition))
  const speechLang = lang === 'te' ? 'te-IN' : 'en-IN'

  useEffect(() => () => {
    rec.current?.abort()
    if (isNative) SpeechRecognition.stop().catch(() => {})
  }, [])

  async function startNative() {
    try {
      const { speechRecognition } = await SpeechRecognition.requestPermissions()
      if (speechRecognition !== 'granted') return
      setListening(true)
      const { matches } = await SpeechRecognition.start({ language: speechLang, maxResults: 1, partialResults: false, popup: false })
      const text = matches?.[0]?.trim()
      if (text) onText(text)
    } catch {
      // Nothing heard or mic busy — the search box still works by typing.
    } finally {
      setListening(false)
    }
  }

  function toggle() {
    if (listening) {
      if (isNative) SpeechRecognition.stop().catch(() => {})
      else rec.current?.stop()
      return
    }
    if (isNative) { startNative(); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const r = new SR()
    r.lang = speechLang
    r.interimResults = false
    r.maxAlternatives = 1
    r.onstart = () => setListening(true)
    r.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript?.trim()
      if (text) onText(text.replace(/[.।]$/, ''))
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    try { r.start() } catch { setListening(false) }
  }

  return { supported, listening, toggle }
}
