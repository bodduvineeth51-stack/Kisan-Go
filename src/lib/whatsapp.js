// Bills go out from the owner's own WhatsApp: the app opens a chat with the
// customer and the message already typed, and the owner taps Send. This costs
// nothing and reaches any customer, but the app can't see whether the message
// was actually sent — a bill counts as "sent" once the owner opens the chat.

export function billMessage(lang, { name, vehicle, hours, rate, amount }) {
  const hrs = Number(hours).toFixed(2)
  if (lang === 'te') {
    return (
      `నమస్కారం ${name} గారు, మీ పని అయింది.\n` +
      `వాహనం: ${vehicle}\n` +
      `సమయం: ${hrs} గంటలు | రేటు: ₹${rate}/గం\n` +
      `మొత్తం: ₹${amount}\n` +
      `— Sent via Kisan Go`
    )
  }
  return (
    `Hi ${name}, your job is done.\n` +
    `Vehicle: ${vehicle}\n` +
    `Time: ${hrs} hrs | Rate: ₹${rate}/hr\n` +
    `Amount due: ₹${amount}\n` +
    `— Sent via Kisan Go`
  )
}

// `phone` is the stored 10-digit number, without the country code
export function whatsappLink(phone, text) {
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`
}

export function billLink(lang, customer, record) {
  return whatsappLink(
    customer.phone,
    billMessage(lang, {
      name: customer.name,
      vehicle: record.vehicle_type,
      hours: record.total_hours,
      rate: record.hourly_rate,
      amount: record.amount,
    }),
  )
}
