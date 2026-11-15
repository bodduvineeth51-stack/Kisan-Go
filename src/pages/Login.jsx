import { useRef, useState } from 'react'
import { RecaptchaVerifier, signInWithPhoneNumber, signOut } from 'firebase/auth'
import { supabase } from '../lib/supabaseClient'
import { getFirebaseAuth } from '../lib/firebaseClient'
import { ArrowRight, Check, Lock } from 'lucide-react'
import { LogoMark } from '../components/Logo'
import { useTrans } from '../context/LangContext'

// Firebase error codes worth a plain-language message; anything else falls
// back to the generic login error.
const FIREBASE_ERRORS = {
  'auth/invalid-phone-number': 'invalidPhone',
  'auth/invalid-verification-code': 'wrongOtp',
  'auth/code-expired': 'otpExpired',
  'auth/too-many-requests': 'tooManyAttempts',
  'auth/quota-exceeded': 'tooManyAttempts',
}

export default function Login() {
  const { t, lang, setLang } = useTrans()
  const [step, setStep] = useState('phone') // 'phone' | 'otp'
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const recaptchaEl = useRef(null)
  const verifier = useRef(null)
  const confirmation = useRef(null)

  const e164Phone = `+91${phone}`

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
    setError('')
    if (!/^\d{10}$/.test(phone)) { setError(t('invalidPhone')); return }
    setLoading(true)
    try {
      const auth = getFirebaseAuth()
      verifier.current ??= new RecaptchaVerifier(auth, recaptchaEl.current, { size: 'invisible' })
      confirmation.current = await signInWithPhoneNumber(auth, e164Phone, verifier.current)
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
    setError('')
    if (!/^\d{6}$/.test(otp)) { setError(t('invalidOtp')); return }
    setLoading(true)
    try {
      const { user } = await confirmation.current.confirm(otp)
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
      // Supabase holds the session from here on
      await signOut(getFirebaseAuth())
    } catch (err) {
      showError(err)
      setLoading(false)
    }
  }

  const field = 'flex h-[62px] items-center overflow-hidden rounded-[18px] border-2 border-primary-bright bg-surface shadow-[0_0_0_5px_var(--color-mint-100)]'
  const bigButton = 'mt-auto flex h-16 items-center justify-center gap-2.5 rounded-[20px] bg-primary text-xl font-extrabold text-white shadow-green disabled:opacity-60'

  return (
    <div className="flex min-h-svh flex-col bg-surface">
      {/* Mint header with logo and fields */}
      <div className="relative flex flex-col gap-4 overflow-hidden rounded-b-[36px] bg-mint-100 px-6 pt-9">
        <div className="absolute -right-[60px] -top-[60px] h-[220px] w-[220px] rounded-full bg-mint-200" />
        <div className="absolute -left-[30px] top-[140px] h-[90px] w-[90px] rounded-full bg-lime opacity-50" />
        <div className="relative mx-auto flex w-full max-w-md flex-col gap-4">
          <LogoMark size={60} />
          <div>
            <div className="text-[44px] font-extrabold leading-none tracking-[-1.5px]">
              Kisan<span className="text-primary-bright">Go</span>
            </div>
            <div className="mt-2.5 text-lg font-semibold text-[#166534]">Your vehicle's notebook, now on your phone.</div>
            <div className="mt-0.5 text-base font-medium text-[#166534]">మీ వాహనం లెక్కలు, మీ ఫోన్‌లో.</div>
          </div>
        </div>
        <svg viewBox="0 0 342 96" preserveAspectRatio="none" aria-hidden="true" className="relative -mx-6 block h-24 w-[calc(100%+48px)] max-w-none">
          <circle cx="286" cy="38" r="20" fill="#FACC15" />
          <path d="M0 72 Q90 44 171 62 T342 52 V96 H0z" fill="#4ADE80" />
          <path d="M0 84 Q100 62 190 78 T342 70 V96 H0z" fill="#22C55E" />
          <path d="M20 96 L60 76 M70 96 L105 74 M120 96 L150 74 M170 96 L196 76 M220 96 L242 76 M270 96 L288 74 M318 96 L332 76" stroke="#86EFAC" strokeWidth="2.5" fill="none" />
        </svg>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-[22px] px-6 pb-[calc(24px+env(safe-area-inset-bottom))] pt-7">
        {step === 'phone' && (
          <form className="flex flex-1 flex-col gap-[22px]" onSubmit={handleSendOtp}>
            <div className="flex flex-col gap-2.5">
              <div className="text-[15px] font-bold">Choose language · భాష ఎంచుకోండి</div>
              <div className="grid grid-cols-2 gap-3">
                {[['te', 'తెలుగు'], ['en', 'English']].map(([code, label]) => {
                  const on = lang === code
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setLang(code)}
                      aria-pressed={on}
                      className={`flex h-[58px] items-center justify-center gap-2 rounded-[18px] border-2 text-[19px] ${
                        on ? 'border-primary-bright bg-mint-100 font-extrabold text-primary' : 'border-border bg-[#F7FBF8] font-semibold text-ink'
                      }`}
                    >
                      {on && <Check size={18} strokeWidth={3} aria-hidden="true" />}
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <label htmlFor="phone" className="text-[15px] font-bold">{t('phoneLabel')}</label>
              <div className={field}>
                <span className="flex h-full items-center bg-mint-50 px-4 text-[19px] font-bold text-primary">+91</span>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  placeholder="98480 12345"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-[21px] font-bold tracking-[1px] outline-none placeholder:font-semibold placeholder:text-muted/50"
                />
              </div>
              <div className="text-sm font-medium text-muted">{t('codeHint')}</div>
              {import.meta.env.DEV && <div className="text-xs font-medium text-muted">{t('testHint')}</div>}
            </div>

            {error && <p className="text-sm font-semibold text-danger">{error}</p>}

            <button type="submit" disabled={loading} className={bigButton}>
              {loading ? t('sending') : t('getCode')}
              {!loading && (
                <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-lime text-ink">
                  <ArrowRight size={20} strokeWidth={2.8} aria-hidden="true" />
                </span>
              )}
            </button>
            <div className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-muted">
              <Lock size={16} strokeWidth={2.2} className="text-primary" aria-hidden="true" />
              {t('dataPrivate')}
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form className="flex flex-1 flex-col gap-[22px]" onSubmit={handleVerifyOtp}>
            <div className="flex flex-col gap-2.5">
              <label htmlFor="otp" className="text-[15px] font-bold">{t('otpLabel', { phone })}</label>
              <div className={field}>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="••••••"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  className="h-full w-full bg-transparent px-4 text-center text-[26px] font-extrabold tracking-[10px] outline-none"
                />
              </div>
            </div>
            {error && <p className="text-sm font-semibold text-danger">{error}</p>}
            <button type="submit" disabled={loading} className={bigButton}>
              {loading ? t('verifying') : t('verifyBtn')}
            </button>
            <button
              type="button"
              onClick={() => { setStep('phone'); setOtp(''); setError('') }}
              className="min-h-11 text-center text-[15px] font-bold text-primary"
            >
              {t('changePhone')}
            </button>
          </form>
        )}
        <div ref={recaptchaEl} />
      </div>
    </div>
  )
}
