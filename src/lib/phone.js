// One place for Indian mobile numbers. Every phone in the app goes through here.
//
// Accepts what users type and what Supabase returns:
//   "9848012345", "+91 98480 12345", "919848012345" (Supabase, no plus),
//   "09848012345", "+91-98480-12345"
// and returns the 10 local digits, or null if it isn't one Indian mobile number.
export function localDigits(input) {
  const d = String(input ?? '').replace(/\D/g, '')
  if (/^\d{10}$/.test(d)) return d
  if (/^(91|0)\d{10}$/.test(d)) return d.slice(-10)
  if (/^0091\d{10}$/.test(d)) return d.slice(-10)
  return null
}

// "+91XXXXXXXXXX", or null.
export function toE164(input) {
  const d = localDigits(input)
  return d ? `+91${d}` : null
}

// For display: "+91 98480 12345".
export function formatPhone(input) {
  const d = localDigits(input)
  return d ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(input ?? '')
}

// A WhatsApp chat with this number, with the message already typed. Opens the
// sender's own WhatsApp; they tap send. Null if the number isn't valid.
export function whatsappUrl(input, text = '') {
  const d = localDigits(input)
  if (!d) return null
  return `https://wa.me/91${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
