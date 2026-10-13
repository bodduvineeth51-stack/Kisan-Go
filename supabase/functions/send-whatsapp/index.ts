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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      record_id,
      customer_phone,
      customer_name,
      vehicle_type,
      total_hours,
      hourly_rate,
      amount,
      lang = 'en',
    } = await req.json()

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? 'whatsapp:+14155238886'

    if (!accountSid || !authToken) {
      throw new Error('TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN secret is missing')
    }

    const hours = Number(total_hours).toFixed(2)
    const contentSid = templateSid(lang)
    const message: Record<string, string> = contentSid
      ? {
          ContentSid: contentSid,
          ContentVariables: JSON.stringify({
            1: String(customer_name),
            2: String(vehicle_type),
            3: hours,
            4: String(hourly_rate),
            5: String(amount),
          }),
        }
      : { Body: buildMessage(lang, customer_name, vehicle_type, hours, hourly_rate, amount) }

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
        To:   `whatsapp:+91${customer_phone}`,
        ...message,
      }).toString(),
    })

    const whatsapp_status = twilioRes.ok ? 'sent' : 'failed'

    if (!twilioRes.ok) {
      const detail = await twilioRes.text()
      console.error('Twilio error:', detail)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    await supabase
      .from('work_records')
      .update({ whatsapp_status })
      .eq('id', record_id)

    return new Response(JSON.stringify({ whatsapp_status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-whatsapp error:', err)
    return new Response(
      JSON.stringify({ whatsapp_status: 'failed', error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
