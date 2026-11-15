import { useEffect, useRef, useState } from 'react'
import { RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth'
import { supabase } from '../lib/supabaseClient'
import { getFirebaseAuth } from '../lib/firebaseClient'
import { useTrans, LangToggle } from '../context/LangContext'
import { localDigits, toE164, formatPhone } from '../lib/phone'
import { readInvitePhone } from '../lib/invite'
import { LogoMark, Wordmark, PhoneField, Field, PrimaryButton } from '../components/ui'

// Firebase error codes worth a plain-language message; anything else falls
// back to the generic login error.
const FIREBASE_ERRORS = {
  'auth/invalid-phone-number': 'invalidPhone',
  'auth/invalid-verification-code': 'wrongOtp',
  'auth/code-expired': 'otpExpired',
  'auth/too-many-requests': 'tooManyAttempts',
  'auth/quota-exceeded': 'tooManyAttempts',
}

// Mint header: logo, tagline, fields drawing, and the small language
// switch in the top-right corner (same "తె | EN" pill as the dashboards).
export function LoginHero({ compact = false }) {
  const { t } = useTrans()
  return (
    <div className={`relative flex flex-col gap-4 overflow-hidden rounded-b-[32px] bg-mint-100 px-6 ${compact ? 'pt-5' : 'pt-8'}`}>
      <div className="flex items-start justify-between gap-3">
        <LogoMark size={compact ? 44 : 56} />
        <LangToggle />
      </div>
      <div>
        <Wordmark className={`block leading-none ${compact ? 'text-[32px] tracking-[-1.2px]' : 'text-[42px] tracking-[-1.5px]'}`} />
        <p className="mt-2 text-base font-semibold text-mint-ink">{t('tagline')}</p>
      </div>
      <svg viewBox="0 0 342 96" preserveAspectRatio="none" aria-hidden="true" className={`-mx-6 block w-[calc(100%+48px)] ${compact ? 'h-12' : 'h-20'}`}>
        <path d="M0 72 Q90 44 171 62 T342 52 V96 H0z" className="fill-circle-2" />
        <path d="M0 84 Q100 62 190 78 T342 70 V96 H0z" className="fill-circle-1" />
      </svg>
    </div>
  )
}

export default function Login() {
  const { t } = useTrans()
  const [step, setStep] = useState('phone') // 'phone' | 'otp'
  // Opened from a driver access link (?invite=<number>): number is filled in.
  // Access still depends on the one-time code, never on the link itself.
  const [invitedPhone] = useState(readInvitePhone)
  const [phone, setPhone] = useState(invitedPhone ?? '')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const recaptchaEl = useRef(null)
  const verifier = useRef(null)
  const confirmation = useRef(null)
  const verifiedUser = useRef(null)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => () => { verifier.current?.clear() }, [])
  useEffect(() => {
    if (!resendIn) return
    const timer = setTimeout(() => setResendIn(n => Math.max(0, n - 1)), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const e164Phone = toE164(phone)

  function showError(err) {
    console.error('[login]', err)
    const key = FIREBASE_ERRORS[err?.code]
    // Unmapped failures keep their code on screen so they can be reported
    setError(key ? t(key) : `${t('loginFailed')}${err?.code ? ` (${err.code})` : ''}`)
  }

  // Firebase sends the SMS and checks the code; the firebase-login edge
  // function then swaps the Firebase ID token for a Supabase session.
  async function handleSendOtp(e) {
    e.preventDefault()
    if (loading) return
    setError('')
    if (!e164Phone) { setError(t('invalidPhone')); return }
    setLoading(true)
    try {
      const auth = getFirebaseAuth()
      verifier.current?.clear()
      verifier.current = new RecaptchaVerifier(auth, recaptchaEl.current, { size: 'invisible' })
      confirmation.current = await signInWithPhoneNumber(auth, e164Phone, verifier.current)
      verifiedUser.current = null
      setOtp('')
      setResendIn(60)
      setStep('otp')
    } catch (err) {
      // A used or failed reCAPTCHA can't be reused for the next attempt
      verifier.current?.clear()
      verifier.current = null
      showError(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    if (loading) return
    setError('')
    if (!/^\d{6}$/.test(otp)) { setError(t('invalidOtp')); return }
    setLoading(true)
    try {
      // If the session exchange fails, retry it without consuming the SMS twice.
      const user = verifiedUser.current ?? (await confirmation.current.confirm(otp)).user
      verifiedUser.current = user
      const idToken = await user.getIdToken()
      const { data, error: fnError } = await supabase.functions.invoke('firebase-login', {
        body: { id_token: idToken },
      })
      if (fnError) throw fnError
      const { error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: data.type,
      })
      if (sessionError) throw sessionError
      // Supabase holds the session from here on. App now runs
      // claim_driver_invite and get_my_role before it picks a screen.
      await signOut(getFirebaseAuth()).catch(() => {})
    } catch (err) {
      showError(err)
    } finally {
      setLoading(false)
    }
  }

  function backToPhone() {
    setStep('phone'); setOtp(''); setError('')
    verifiedUser.current = null; confirmation.current = null
    verifier.current?.clear(); verifier.current = null
  }

  const errorBox = error && (
    <p role="alert" className="rounded-2xl bg-due-bg px-4 py-3 text-sm font-semibold text-danger">{error}</p>
  )

  return (
    <div className="flex min-h-svh flex-col bg-surface">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
        <LoginHero />

        {step === 'phone' && (
          <form className="flex flex-1 flex-col gap-[22px] px-6 pb-6 pt-7" onSubmit={handleSendOtp}>
            {invitedPhone && (
              <p className="rounded-2xl bg-mint-100 px-4 py-3 text-sm font-semibold text-primary">{t('inviteBanner')}</p>
            )}
            <PhoneField
              id="phone"
              big
              label={t('phoneLabel')}
              value={phone}
              disabled={loading}
              onChange={setPhone}
            />
            {errorBox}
            <div className="mt-auto flex flex-col gap-4 pt-2">
              <PrimaryButton type="submit" disabled={loading} arrow={!loading}>
                {loading ? t('sending') : t('sendOtp')}
              </PrimaryButton>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form className="flex flex-1 flex-col gap-[22px] px-6 pb-6 pt-7" onSubmit={handleVerifyOtp}>
            <Field
              id="otp"
              label={t('otpLabel', { phone: formatPhone(localDigits(phone) ?? phone) })}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={otp}
              disabled={loading}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              inputClassName="text-center text-[26px]! font-extrabold! tracking-[10px]"
            />
            {errorBox}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={backToPhone}
                className="min-h-11 text-sm font-bold text-muted"
              >
                {t('changePhone')}
              </button>
              <button
                type="button"
                disabled={loading || resendIn > 0}
                onClick={handleSendOtp}
                className="min-h-11 rounded-xl bg-mint-50 px-3 text-sm font-bold text-primary disabled:bg-transparent disabled:text-muted"
              >
                {resendIn > 0 ? t('resendIn', { n: resendIn }) : t('resendOtp')}
              </button>
            </div>
            <div className="mt-auto flex flex-col gap-4 pt-2">
              <PrimaryButton type="submit" disabled={loading} arrow={!loading}>
                {loading ? t('verifying') : t('verifyBtn')}
              </PrimaryButton>
            </div>
          </form>
        )}
        <div ref={recaptchaEl} />
      </div>
    </div>
  )
}
