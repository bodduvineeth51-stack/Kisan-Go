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

// "తె | EN" pill from the design's top bar. One tap switches language; the
// current one is shown in bold green.
export function LangToggle() {
  const { lang, setLang } = useLang()
  const label = translations[lang]?.changeLanguage ?? translations.en.changeLanguage
  const part = (code) => (lang === code ? 'font-extrabold text-primary' : 'font-semibold text-muted')
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'te' : 'en')}
      aria-label={label}
      className="flex h-11 shrink-0 items-center gap-1.5 rounded-[22px] bg-surface px-4 text-sm shadow-soft"
    >
      <span className={part('te')}>తె</span>
      <span className="text-border">|</span>
      <span className={part('en')}>EN</span>
    </button>
  )
}
