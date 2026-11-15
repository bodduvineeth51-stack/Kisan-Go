import { Mic, Search, Square } from 'lucide-react'
import { useTrans } from '../context/LangContext'
import { useVoiceSearch } from '../lib/useVoiceSearch'

// Customers search: white 56px bar, search icon, green voice button.
export default function SearchBar({ value, onChange }) {
  const { t } = useTrans()
  const voice = useVoiceSearch(onChange)
  return (
    <div className="flex h-14 items-center gap-2.5 rounded-[18px] bg-surface pl-4 shadow-card">
      <Search size={22} strokeWidth={2.2} className="shrink-0 text-muted" aria-hidden="true" />
      <label htmlFor="customer-search" className="sr-only">{t('searchCustomers')}</label>
      <input
        id="customer-search"
        type="search"
        placeholder={t('searchPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-base font-medium text-ink outline-none placeholder:text-muted/70"
      />
      {voice.supported && (
        <button
          type="button"
          onClick={voice.toggle}
          aria-label={voice.listening ? t('stopListening') : t('searchByVoice')}
          className={`relative mr-[5px] flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] text-white ${
            voice.listening ? 'bg-danger' : 'bg-primary'
          }`}
        >
          {voice.listening
            ? <Square size={16} fill="currentColor" aria-hidden="true" />
            : <Mic size={20} strokeWidth={2.2} aria-hidden="true" />}
          {voice.listening && <span className="absolute inset-0 animate-ping rounded-[14px] bg-danger/30" />}
        </button>
      )}
    </div>
  )
}

// Pill filters (All / Owes money / Paid).
export function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map(([id, label]) => {
        const on = value === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-pressed={on}
            className={`h-11 shrink-0 rounded-[22px] px-4 text-sm ${
              on ? 'bg-primary font-extrabold text-white shadow-pill' : 'bg-surface font-semibold text-ink shadow-pill-off'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
