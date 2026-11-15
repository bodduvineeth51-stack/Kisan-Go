// Shared building blocks for every screen. Sizes, colours, corners and
// shadows come from kisan-design/screens/*.html — keep them in sync with
// DESIGN.md rather than restyling one screen at a time.
import { ArrowRight, ChevronLeft, X } from 'lucide-react'
import translations from '../lib/i18n'
import { useTrans } from '../context/LangContext'

export function LogoMark({ size = 38, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect width="36" height="36" rx="11" fill="#15803D" />
      <circle cx="18" cy="21" r="8" fill="none" stroke="#BEF264" strokeWidth="3" />
      <circle cx="18" cy="21" r="2.5" fill="#BEF264" />
      <path d="M18 13c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z" fill="#FFFFFF" />
    </svg>
  )
}

export function Wordmark({ className = 'text-[22px] tracking-[-0.5px]' }) {
  return (
    <span className={`font-extrabold text-ink ${className}`}>
      Kisan<span className="text-primary-bright">Go</span>
    </span>
  )
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <Wordmark />
    </div>
  )
}

// English label with the Telugu one beneath (DESIGN.md: main actions are
// bilingual). In Telugu mode only the Telugu label is shown.
export function Bilingual({ k, vars, subClass = 'text-sm font-medium opacity-90' }) {
  const { t, lang } = useTrans()
  const te = translations.te[k]
  return (
    <span className="flex flex-col leading-[1.15]">
      <span>{t(k, vars)}</span>
      {lang === 'en' && te && (
        <span className={subClass}>{te.replace(/\{(\w+)\}/g, (_, v) => String(vars?.[v] ?? ''))}</span>
      )}
    </span>
  )
}

export function BackButton({ onClick, label, flat = false }) {
  const { t } = useTrans()
  return (
    <button
      onClick={onClick}
      aria-label={label ?? t('back')}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface text-ink active:scale-95 ${flat ? '' : 'shadow-soft'}`}
    >
      <ChevronLeft size={22} strokeWidth={2.4} aria-hidden="true" />
    </button>
  )
}

// Screen title row: big heading + optional green count chip / right slot.
export function PageHeader({ title, chip, right }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h1 className="min-w-0 truncate text-[28px] font-extrabold tracking-[-0.8px] text-ink">{title}</h1>
      <div className="flex shrink-0 items-center gap-2">
        {chip != null && <Chip>{chip}</Chip>}
        {right}
      </div>
    </div>
  )
}

const CHIP_TONES = {
  mint: 'bg-mint-100 text-primary',
  solid: 'bg-primary text-white',
  due: 'bg-due-bg text-due',
  amber: 'bg-amber-bg text-amber',
  blue: 'bg-blue-bg text-blue',
  muted: 'bg-mint-50 text-muted',
}

export function Chip({ tone = 'mint', small = false, className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap font-extrabold ${
        small ? 'rounded-lg px-2 py-px text-xs' : 'rounded-xl px-3 py-[5px] text-[13px]'
      } ${CHIP_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Spinner({ label }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-10">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-mint-200 border-t-primary" />
      {label && <p className="text-sm font-semibold text-muted">{label}</p>}
    </div>
  )
}

export function ErrorCard({ message, onRetry }) {
  const { t } = useTrans()
  return (
    <div role="alert" className="rounded-[18px] bg-surface px-4 py-3 text-center shadow-card">
      <p className="text-sm font-semibold text-danger">{message || t('somethingWrong')}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-1 min-h-11 px-3 text-sm font-bold text-primary underline">
          {t('retry')}
        </button>
      )}
    </div>
  )
}

export function EmptyCard({ title, sub }) {
  return (
    <div className="rounded-[18px] bg-surface px-4 py-8 text-center shadow-card">
      <p className="text-base font-bold text-ink">{title}</p>
      {sub && <p className="mt-1 text-sm font-medium text-muted">{sub}</p>}
    </div>
  )
}

// White card that lifts off the mint page (DESIGN.md: no border).
export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`rounded-[22px] bg-surface shadow-card ${className}`} {...rest}>
      {children}
    </div>
  )
}

// Bottom sheet for forms and confirmations.
export function Sheet({ title, onClose, children }) {
  const { t } = useTrans()
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[26px] bg-surface px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-border" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[22px] font-extrabold tracking-[-0.5px] text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-mint-50 text-ink"
          >
            <X size={20} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const FIELD_BOX =
  'rounded-[18px] border-2 border-border bg-surface transition-shadow focus-within:border-primary-bright focus-within:shadow-[0_0_0_5px_#DCFCE7]'

export function FieldLabel({ htmlFor, children }) {
  return <label htmlFor={htmlFor} className="text-[15px] font-bold text-ink">{children}</label>
}

// Labelled text input (login screen style).
export function Field({ id, label, hint, className = '', inputClassName = '', ...input }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <div className={`flex h-[58px] items-center overflow-hidden ${FIELD_BOX}`}>
        <input
          id={id}
          className={`h-full min-w-0 flex-1 bg-transparent px-4 text-[17px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-muted/60 ${inputClassName}`}
          {...input}
        />
      </div>
      {hint && <p className="text-sm font-medium text-muted">{hint}</p>}
    </div>
  )
}

// +91 mobile number input.
export function PhoneField({ id, label, hint, big = false, value, onChange, className = '', ...input }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <div className={`flex items-center overflow-hidden ${big ? 'h-[62px]' : 'h-[58px]'} ${FIELD_BOX}`}>
        <span className={`flex h-full items-center bg-mint-50 px-4 font-bold text-primary ${big ? 'text-[19px]' : 'text-[17px]'}`}>
          +91
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          maxLength={13}
          placeholder="9876543210"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          className={`h-full min-w-0 flex-1 bg-transparent px-3.5 font-bold tracking-[1px] text-ink outline-none placeholder:font-medium placeholder:tracking-normal placeholder:text-muted/60 ${big ? 'text-[21px]' : 'text-[18px]'}`}
          {...input}
        />
      </div>
      {hint && <p className="text-sm font-medium text-muted">{hint}</p>}
    </div>
  )
}

// Two-state choice button (language, vehicle). Selected = green outline + check.
export function ChoiceButton({ selected, onClick, children, className = '', ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-[56px] items-center justify-center gap-2 rounded-[18px] border-2 px-3 text-center transition-colors active:scale-[0.98] ${
        selected
          ? 'border-primary-bright bg-mint-100 font-extrabold text-primary'
          : 'border-border bg-field font-semibold text-ink'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

// Main green action. `arrow` adds the lime arrow circle from the login screen.
export function PrimaryButton({ arrow = false, className = '', children, ...rest }) {
  return (
    <button
      className={`flex min-h-16 w-full items-center justify-center gap-2.5 rounded-[20px] bg-primary px-4 text-xl font-extrabold text-white shadow-green transition-transform active:scale-[0.98] disabled:opacity-60 ${className}`}
      {...rest}
    >
      {children}
      {arrow && (
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-lime text-ink">
          <ArrowRight size={20} strokeWidth={2.8} aria-hidden="true" />
        </span>
      )}
    </button>
  )
}

// White action with green text (Add time, Record payment …).
export function SecondaryButton({ className = '', children, ...rest }) {
  return (
    <button
      className={`flex min-h-[58px] items-center justify-center gap-2 rounded-[18px] bg-surface px-4 text-base font-extrabold text-primary shadow-card transition-transform active:scale-[0.98] disabled:opacity-60 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

// Date square used in history lists: big day number over short month.
export function DateTile({ iso, solid = false }) {
  const d = new Date(iso)
  return (
    <span
      className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl text-[11px] font-extrabold uppercase leading-[1.1] ${
        solid ? 'bg-primary text-white' : 'bg-mint-50 text-primary'
      }`}
    >
      <span className="text-[15px]">{d.getDate()}</span>
      {d.toLocaleDateString('en-IN', { month: 'short' })}
    </span>
  )
}
