import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const VEHICLE_TYPES = [
  'Tractor',
  'Harvester',
  'Rotavator',
  'Trailer',
  'Cultivator',
  'Seed Drill',
  'Sprayer',
  'Thresher',
]

export default function ProfileSetup({ user, onComplete }) {
  const [name, setName] = useState('')
  const [selectedTypes, setSelectedTypes] = useState([])
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function toggleType(type) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Enter your name.')
      return
    }
    if (selectedTypes.length === 0) {
      setError('Select at least one vehicle type.')
      return
    }
    const vehicleRates = selectedTypes.map((type) => ({
      type,
      hourly_rate: Number(rates[type]),
    }))
    if (vehicleRates.some((v) => !v.hourly_rate || v.hourly_rate <= 0)) {
      setError('Enter a valid hourly rate for each selected vehicle type.')
      return
    }

    setLoading(true)
    const { error } = await supabase.from('owners').insert({
      id: user.id,
      name: name.trim(),
      phone: user.phone,
      vehicle_rates: vehicleRates,
    })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }
    onComplete()
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Set up your profile</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tell us about the vehicles you rent out.
        </p>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Your name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ramesh Kumar"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700">
              Vehicle types & hourly rate
            </span>
            <div className="mt-2 space-y-2">
              {VEHICLE_TYPES.map((type) => {
                const checked = selectedTypes.includes(type)
                return (
                  <div
                    key={type}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <input
                      id={`vt-${type}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleType(type)}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
                    />
                    <label htmlFor={`vt-${type}`} className="flex-1 text-sm text-gray-700">
                      {type}
                    </label>
                    {checked && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">₹</span>
                        <input
                          type="number"
                          min="1"
                          placeholder="Rate/hr"
                          value={rates[type] ?? ''}
                          onChange={(e) =>
                            setRates((prev) => ({ ...prev, [type]: e.target.value }))
                          }
                          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-600 py-2 font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
          >
            {loading ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>
    </div>
  )
}
