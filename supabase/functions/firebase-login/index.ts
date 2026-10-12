/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5'

// Exchanges a Firebase phone-auth ID token for a Supabase session.
//
// Firebase sends and checks the SMS code. This function verifies the resulting
// ID token, finds or creates the Supabase user for that phone number, and
// returns a one-time token hash the client redeems with auth.verifyOtp().
// The Supabase user id (auth.uid()) stays a uuid, so RLS is unchanged.
//
// Deploy with --no-verify-jwt: it is called before the user has a session.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const firebaseKeys = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const projectId = Deno.env.get('FIREBASE_PROJECT_ID')
    if (!projectId) throw new Error('FIREBASE_PROJECT_ID secret is missing')

    const { id_token } = await req.json()
    if (!id_token) return json({ error: 'id_token is required' }, 400)

    let phone: string
    try {
      const { payload } = await jwtVerify(id_token, firebaseKeys, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      })
      phone = String(payload.phone_number ?? '')
    } catch (err) {
      console.error('firebase-login: token rejected:', err)
      return json({ error: 'Invalid or expired login token' }, 401)
    }
    if (!/^\+\d{8,15}$/.test(phone)) {
      return json({ error: 'Token has no verified phone number' }, 401)
    }

    const digits = phone.slice(1)
    // Supabase can only mint a session link for an email identity, so each
    // phone number gets a fixed stand-in address. `.invalid` is a reserved
    // TLD: no mail sent to it can ever be delivered.
    const email = `${digits}@phone.kisango.invalid`

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )

    const { error: createErr } = await supabase.auth.admin.createUser({
      email,
      phone,
      email_confirm: true,
      phone_confirm: true,
    })

    if (createErr?.code === 'phone_exists') {
      // Account made by the old Supabase SMS login: attach the stand-in email
      // so the owner keeps the same user id and data.
      let legacyId: string | null = null
      for (let page = 1; page <= 10 && !legacyId; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        legacyId = data.users.find((u) => u.phone === digits)?.id ?? null
        if (data.users.length < 1000) break
      }
      if (!legacyId) throw new Error('Existing phone account not found')
      const { error } = await supabase.auth.admin.updateUserById(legacyId, {
        email,
        email_confirm: true,
      })
      if (error) throw error
    } else if (createErr && createErr.code !== 'email_exists') {
      throw createErr
    }

    const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkErr) throw linkErr

    return json({
      token_hash: link.properties.hashed_token,
      type: link.properties.verification_type,
    })
  } catch (err) {
    console.error('firebase-login error:', err)
    return json({ error: 'Login failed' }, 500)
  }
})
