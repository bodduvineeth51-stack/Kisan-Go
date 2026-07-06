import { createContext, useContext, useState } from 'react'
import translations from '../lib/i18n'

const LangCtx = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(
    () => localStorage.getItem('kisan_lang') || 'en'
  )

  function setLang(l) {
    setLangState(l)
    localStorage.setItem('kisan_lang', l)
  }

  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>
}

export function useLang() {
  return useContext(LangCtx)
}

export function useTrans() {
  const { lang, setLang } = useLang()
  function t(key, vars = {}) {
    const str = translations[lang]?.[key] ?? translations.en?.[key] ?? key
    return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
  }
  return { t, lang, setLang }
}

export function LangToggle({ variant = 'dark' }) {
  const { lang, setLang } = useLang()
  const isDark = variant === 'dark'
  return (
    <div className={`flex overflow-hidden rounded-xl text-sm ${
      isDark ? 'border border-green-500' : 'border border-gray-200'
    }`}>
      {[['en', 'EN'], ['te', 'తె']].map(([code, label]) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          className={`px-3 py-1.5 font-semibold transition-colors ${
            isDark
              ? lang === code ? 'bg-white text-green-700' : 'text-green-100 hover:bg-green-700'
              : lang === code ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
