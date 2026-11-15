// Kisan Go mark: green rounded square with a lime wheel and a leaf.
export function LogoMark({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="11" fill="#15803D" />
      <circle cx="18" cy="21" r="8" fill="none" stroke="#BEF264" strokeWidth="3" />
      <circle cx="18" cy="21" r="2.5" fill="#BEF264" />
      <path d="M18 13c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z" fill="#FFFFFF" />
    </svg>
  )
}

export default function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[22px] font-extrabold tracking-[-0.5px] text-ink">
        Kisan<span className="text-primary-bright">Go</span>
      </span>
    </div>
  )
}
