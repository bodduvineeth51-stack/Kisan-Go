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

// "తె | EN" pill used in page headers; flips the whole app language.
export function LangButton() {
  const { t, lang, setLang } = useTrans()
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'te' : 'en')}
      aria-label={t('changeLanguage')}
      className="h-11 shrink-0 rounded-[22px] bg-surface px-4 text-sm font-bold text-primary shadow-[0_2px_10px_rgba(15,42,26,0.08)]"
    >
      తె | EN
    </button>
  )
}
