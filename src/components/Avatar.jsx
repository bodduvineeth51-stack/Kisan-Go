import { initials } from '../lib/format'

// Rounded-square initials avatar. One calm colour for everyone — the
// multi-colour pairs made long lists look busy.
const SIZES = {
  sm: 'h-10 w-10 rounded-[13px] text-sm',
  md: 'h-[42px] w-[42px] rounded-[14px] text-[15px]',
  lg: 'h-11 w-11 rounded-[14px] text-base',
}

export default function Avatar({ name = '', size = 'md' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center bg-mint-100 font-bold text-primary ${SIZES[size]}`}>
      {initials(name)}
    </span>
  )
}
