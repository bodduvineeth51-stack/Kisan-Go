import { supabase } from './supabaseClient'
import { formatMoney } from './format'

// Ask the send-whatsapp edge function to send a bill for a saved record.
// Returns the new whatsapp_status ('sent' | 'failed'); never throws.
export async function sendBill(record, customer, lang) {
  try {
    const { data } = await supabase.functions.invoke('send-whatsapp', {
      body: {
        record_id: record.id,
        customer_phone: customer.phone,
        customer_name: customer.name,
        vehicle_type: record.vehicle_type,
        total_hours: record.total_hours,
        hourly_rate: record.hourly_rate,
        amount: record.amount,
        lang,
      },
    })
    return data?.whatsapp_status ?? 'failed'
  } catch {
    return 'failed'
  }
}

// What the customer sees on WhatsApp. Keep in step with buildMessage() in
// supabase/functions/send-whatsapp/index.ts.
export function billMessage(lang, { name, vehicle, hours, rate, amount }) {
  if (lang === 'te') {
    return (
      `నమస్కారం ${name} గారు, మీ పని అయింది.\n` +
      `వాహనం: ${vehicle}\n` +
      `సమయం: ${hours} గంటలు | రేటు: ₹${rate}/గం\n` +
      `మొత్తం: ₹${amount}\n` +
      `— Sent via Kisan Go`
    )
  }
  return (
    `Hi ${name}, your Kisan Go job is done.\n` +
    `Vehicle: ${vehicle}\n` +
    `Time: ${hours} hrs | Rate: ₹${rate}/hr\n` +
    `Amount due: ₹${amount}\n` +
    `— Sent via Kisan Go`
  )
}

// wa.me link that opens WhatsApp on the owner's phone with a payment
// reminder typed in, ready to send.
export function reminderLink(customer, amount, lang) {
  const text = lang === 'te'
    ? `నమస్కారం ${customer.name} గారు, మీ పనికి ${formatMoney(amount)} బాకీ ఉంది. దయచేసి చెల్లించండి.\n— Sent via Kisan Go`
    : `Namaste ${customer.name} garu, ${formatMoney(amount)} is pending for your farm work. Please pay when you can.\n— Sent via Kisan Go`
  return `https://wa.me/91${customer.phone}?text=${encodeURIComponent(text)}`
}

export function chatLink(customer) {
  return `https://wa.me/91${customer.phone}`
}

// Per-customer money: billed (all records) and owed (billed, unless the
// customer is marked paid). `since` = date of their oldest bill.
export function moneyByCustomer(customers, records) {
  const out = {}
  for (const c of customers) out[c.id] = { billed: 0, owed: 0, since: null }
  for (const r of records) {
    const m = out[r.customer_id]
    if (!m) continue
    m.billed += Number(r.amount)
    const d = new Date(r.created_at)
    if (!m.since || d < m.since) m.since = d
  }
  for (const c of customers) {
    const m = out[c.id]
    m.owed = c.is_paid ? 0 : m.billed
  }
  return out
}

export function daysSince(date) {
  if (!date) return 0
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
}

// "98480 12345" display form of a 10-digit number
export function formatPhone(phone = '') {
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone
}
