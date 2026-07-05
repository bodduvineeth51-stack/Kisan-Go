import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const TEST_PHONE_HINT = 'Test number: 9876543210 · Code: 123456'

export default function Login() {
  const [step, setStep] = useState('phone') // 'phone' | 'otp'
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const e164Phone = `+91${phone}`

  async function handleSendOtp(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{10}$/.test(phone)) {
      setError('Enter a valid 10-digit phone number.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      phone: e164Phone,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setStep('otp')
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp({
      phone: e164Phone,
      token: otp,
      type: 'sms',
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    }
    // On success, the auth listener in App.jsx picks up the new session.
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">KisanGo</h1>
        <p className="mt-1 text-sm text-gray-500">Owner sign in</p>

        {step === 'phone' && (
          <form className="mt-6 space-y-4" onSubmit={handleSendOtp}>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Phone number
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
                  className="w-full rounded-lg px-2 py-2 outline-none"
                />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-green-600 py-2 font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Send OTP'}
            </button>
            <p className="text-center text-xs text-gray-400">{TEST_PHONE_HINT}</p>
          </form>
        )}

        {step === 'otp' && (
          <form className="mt-6 space-y-4" onSubmit={handleVerifyOtp}>
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
                Enter OTP sent to +91{phone}
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 tracking-widest outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-green-600 py-2 font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
            >
              {loading ? 'Verifying…' : 'Verify & continue'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone')
                setOtp('')
                setError('')
              }}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
            >
              Change phone number
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
