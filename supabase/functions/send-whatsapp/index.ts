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
    const body  = buildMessage(lang, customer_name, vehicle_type, hours, hourly_rate, amount)

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
        Body: body,
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
