import { initials } from '../lib/format'

// Rounded-square initials avatar. Colour pairs from DESIGN.md, picked by
// customer id so the same customer keeps the same colour on every screen.
const PAIRS = [
  ['#BBF7D0', '#166534'],
  ['#FEF3C7', '#92400E'],
  ['#E0F2FE', '#075985'],
  ['#FCE7F3', '#9D174D'],
  ['#EDE9FE', '#5B21B6'],
]

function pairFor(id = '') {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PAIRS[h % PAIRS.length]
}

const SIZES = {
  sm: 'h-10 w-10 rounded-[13px] text-sm',
  md: 'h-[42px] w-[42px] rounded-[14px] text-[15px]',
  lg: 'h-11 w-11 rounded-[14px] text-base',
}

export default function Avatar({ id, name = '', size = 'md' }) {
  const [bg, fg] = pairFor(id)
  return (
    <span
      className={`flex shrink-0 items-center justify-center font-extrabold ${SIZES[size]}`}
      style={{ background: bg, color: fg }}
    >
      {initials(name)}
    </span>
  )
}
