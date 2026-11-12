/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildMessage(
  lang: string,
  name: string,
  vehicle: string,
  hours: string,
  rate: number,
  amount: number,
): string {
  if (lang === 'te') {
    return (
      `నమస్కారం ${name} గారు, మీ పని అయింది.\n` +
      `వాహనం: ${vehicle}\n` +
      `సమయం: ${hours} గంటలు | రేటు: ₹${rate}/గం\n` +
      `మొత్తం: ₹${amount}\n` +
      `— Kisan Go`
    )
  }
  return (
    `Hi ${name}, your Kisan Go job is done.\n` +
    `Vehicle: ${vehicle}\n` +
    `Time: ${hours} hrs | Rate: ₹${rate}/hr\n` +
    `Amount due: ₹${amount}\n` +
    `— Kisan Go`
  )
}

// A registered WhatsApp Business sender may only start a conversation with a
// Meta-approved template. When a template Content SID is configured for the
// language, send that with its variables; otherwise fall back to free-form
// text, which works in the Twilio sandbox.
//
// Template variables: {{1}} name, {{2}} vehicle, {{3}} hours, {{4}} rate,
// {{5}} amount — the same order as buildMessage().
function templateSid(lang: string): string | undefined {
  return lang === 'te'
    ? Deno.env.get('TWILIO_WHATSAPP_TEMPLATE_TE')
    : Deno.env.get('TWILIO_WHATSAPP_TEMPLATE_EN')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Same rule as src/lib/phone.js (Deno can't import the web app's module):
// 10 digits, or 91/0 + 10 digits → "+91XXXXXXXXXX".
function toE164(input: unknown): string | null {
  const d = String(input ?? '').replace(/\D/g, '')
  if (/^\d{10}$/.test(d)) return `+91${d}`
  if (/^(91|0)\d{10}$/.test(d)) return `+91${d.slice(-10)}`
  return null
}

// Sends the bill for one work record.
//
// Who may call it (checked here, with the caller's own JWT):
//   * the owner of the business the record belongs to, or
//   * an ACTIVE driver of that same business, for a record they created.
// Revoked drivers, invited-but-not-linked drivers and other businesses get 403.
//
// Everything on the bill (customer name and phone, vehicle, hours, rate,
// amount) is read from the database. Values in the request body are ignored,
// so nobody can send a made-up amount or message an arbitrary number.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json({ whatsapp_status: 'failed', error: 'not_logged_in' }, 401)

    const { record_id, lang = 'en' } = await req.json()
    if (!record_id) return json({ whatsapp_status: 'failed', error: 'record_id is required' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
    const callerId = userData?.user?.id
    if (userErr || !callerId) return json({ whatsapp_status: 'failed', error: 'not_logged_in' }, 401)

    const { data: record, error: recErr } = await admin
      .from('work_records')
      .select('id, owner_id, created_by, vehicle_type, hourly_rate, total_hours, amount, customers(name, phone)')
      .eq('id', record_id)
      .maybeSingle()
    if (recErr) throw recErr
    // Same answer for "no such record" and "not yours": don't reveal which.
    if (!record) return json({ whatsapp_status: 'failed', error: 'not_allowed' }, 403)

    let allowed = record.owner_id === callerId
    if (!allowed && record.created_by === callerId) {
      const { data: membership, error: memErr } = await admin
        .from('memberships')
        .select('id')
        .eq('user_id', callerId)
        .eq('business_id', record.owner_id)
        .eq('role', 'driver')
        .eq('status', 'active')
        .maybeSingle()
      if (memErr) throw memErr
      allowed = Boolean(membership)
    }
    if (!allowed) return json({ whatsapp_status: 'failed', error: 'not_allowed' }, 403)

    const customer = Array.isArray(record.customers) ? record.customers[0] : record.customers
    const to = toE164(customer?.phone)
    if (!customer || !to) throw new Error('Customer phone missing or invalid')

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? 'whatsapp:+14155238886'

    if (!accountSid || !authToken) {
      throw new Error('TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN secret is missing')
    }

    const name = String(customer.name)
    const vehicle = String(record.vehicle_type)
    const rate = Number(record.hourly_rate)
    const amount = Number(record.amount)
    const hours = Number(record.total_hours).toFixed(2)
    const contentSid = templateSid(lang)
    const message: Record<string, string> = contentSid
      ? {
          ContentSid: contentSid,
          ContentVariables: JSON.stringify({
            1: name,
            2: vehicle,
            3: hours,
            4: String(rate),
            5: String(amount),
          }),
        }
      : { Body: buildMessage(lang, name, vehicle, hours, rate, amount) }

    const twilioUrl =
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromNumber,
        To:   `whatsapp:${to}`,
        ...message,
      }).toString(),
    })

    const whatsapp_status = twilioRes.ok ? 'sent' : 'failed'

    if (!twilioRes.ok) {
      const detail = await twilioRes.text()
      console.error('Twilio error:', detail)
    }

    // Service role on purpose: drivers have no UPDATE policy on work_records.
    const { error: updErr } = await admin
      .from('work_records')
      .update({ whatsapp_status })
      .eq('id', record.id)
    if (updErr) console.error('send-whatsapp: status update failed:', updErr)

    return json({ whatsapp_status })
  } catch (err) {
    console.error('send-whatsapp error:', err)
    return json({ whatsapp_status: 'failed', error: String(err) }, 500)
  }
})
