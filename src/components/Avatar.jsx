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

export default function Avatar({ id, name = '' }) {
  const [bg, fg] = pairFor(id)
  const initials = name.trim().slice(0, 2).toUpperCase()
  return (
    <span
      className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] text-[15px] font-extrabold"
      style={{ background: bg, color: fg }}
    >
      {initials}
    </span>
  )
}
