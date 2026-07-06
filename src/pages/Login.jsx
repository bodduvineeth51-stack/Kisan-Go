import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useTrans, LangToggle } from '../context/LangContext'

export default function Login() {
  const { t } = useTrans()
  const [step, setStep] = useState('phone') // 'phone' | 'otp'
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const e164Phone = `+91${phone}`

  async function handleSendOtp(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{10}$/.test(phone)) { setError(t('invalidPhone')); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({ phone: e164Phone })
    setLoading(false)
    if (error) { setError(error.message); return }
    setStep('otp')
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(otp)) { setError(t('invalidOtp')); return }
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({ phone: e164Phone, token: otp, type: 'sms' })
    setLoading(false)
    if (error) setError(error.message)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        {/* App name + lang toggle */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Kisan Go</h1>
            <p className="mt-0.5 text-sm text-gray-500">{t('tagline')}</p>
          </div>
          <LangToggle variant="light" />
        </div>

        {step === 'phone' && (
          <form className="mt-6 space-y-4" onSubmit={handleSendOtp}>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                {t('phoneLabel')}
              </label>
              <div className="mt-1 flex items-center rounded-lg border border-gray-300 focus-within:border-green-600 focus-within:ring-1 focus-within:ring-green-600">
                <span className="pl-3 text-gray-500">+91</span>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-lg px-2 py-2.5 outline-none"
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
            >
              {loading ? t('sending') : t('sendOtp')}
            </button>
            <p className="text-center text-xs text-gray-400">{t('testHint')}</p>
          </form>
        )}

        {step === 'otp' && (
          <form className="mt-6 space-y-4" onSubmit={handleVerifyOtp}>
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
                {t('otpLabel', { phone })}
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 tracking-widest outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
            >
              {loading ? t('verifying') : t('verifyBtn')}
            </button>
            <button
              type="button"
              onClick={() => { setStep('phone'); setOtp(''); setError('') }}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
            >
              {t('changePhone')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
