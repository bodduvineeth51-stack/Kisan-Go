import { test, expect } from '@playwright/test'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), 'VITE_')
const storageKey = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
const OWNER = '00000000-0000-4000-b000-000000000001'
const DRIVER = '00000000-0000-4000-b000-000000000002'

async function setup(page, { role = 'owner', invited = false, status = 'active', signedIn = true } = {}) {
  // role 'both' = an owner who is also a driver for another business (Lakshmi Farms).
  const ownerLogin = role === 'owner' || role === 'both'
  const user = { id: ownerLogin ? OWNER : DRIVER, phone: ownerLogin ? '919848000001' : '919848000002', aud: 'authenticated', role: 'authenticated' }
  const owner = { id: OWNER, name: 'Srinivas', phone: '919848000001', vehicle_rates: [{ type: 'Tractor', hourly_rate: 1200 }] }
  const customer = { id: '00000000-0000-4000-b000-000000000010', name: 'Ramulu', phone: '9848099999', owner_id: OWNER, is_paid: false }
  const state = { owner, role, status, jobs: [], members: [], claimFails: false, modes: {} }
  if (signedIn) await page.addInitScript(({ storageKey, user }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify({ access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }))
  }, { storageKey, user })
  await page.route('**/*.supabase.co/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const body = request.postDataJSON()
    let data = []
    const mode = request.headers()['x-kisan-mode']
    if (url.pathname.startsWith('/rest/v1/rpc/')) state.modes[url.pathname.split('/').pop()] = mode
    if (url.pathname === '/rest/v1/rpc/get_my_role' && state.role === 'both') {
      const ownerRow = { role: 'owner', status: 'active', business_id: OWNER, business_name: owner.name, name: owner.name, vehicle_rates: owner.vehicle_rates }
      const driverRow = { role: 'driver', status: state.status, business_id: 'other-business', business_name: 'Lakshmi Farms', name: 'Srinivas', vehicle_rates: [{ type: 'Harvester', hourly_rate: 2000 }] }
      return route.fulfill({ status: 200, json: mode === 'driver' ? [driverRow, ownerRow] : [ownerRow, driverRow] })
    }
    if (url.pathname === '/auth/v1/user') data = user
    else if (url.pathname === '/rest/v1/rpc/claim_driver_invite') {
      if (state.claimFails) return route.fulfill({ status: 503, json: { message: 'Temporarily unavailable' } })
      data = invited ? 1 : 0
    } else if (url.pathname === '/rest/v1/rpc/get_my_role') {
      data = state.role === null ? [] : [{ role: state.role, status: state.status, business_id: OWNER, business_name: state.owner.name, name: state.role === 'owner' ? state.owner.name : 'Ravi', vehicle_rates: state.owner.vehicle_rates }]
    } else if (url.pathname === '/rest/v1/owners') {
      if (request.method() === 'PATCH') Object.assign(state.owner, body)
      data = { ...state.owner }
    } else if (url.pathname === '/rest/v1/memberships') data = state.members
    else if (url.pathname === '/rest/v1/rpc/add_driver') {
      const driver = { id: 'membership-1', name: body.p_name, phone: body.p_phone, status: 'invited' }
      state.members.push(driver); data = [driver]
    } else if (url.pathname.endsWith('/list_customers_basic') || url.pathname === '/rest/v1/customers') data = [customer]
    else if (url.pathname.endsWith('/my_work_records') || url.pathname === '/rest/v1/work_records') data = state.jobs
    else if (url.pathname.endsWith('/submit_work_record')) {
      const rate = state.owner.vehicle_rates.find(v => v.type === body.p_vehicle_type).hourly_rate
      const hours = body.p_sessions.reduce((sum, s) => sum + Math.ceil((new Date(s.stop) - new Date(s.start)) / 60000), 0) / 60
      const record = { id: 'record-1', customer_id: customer.id, customer_name: customer.name, vehicle_type: body.p_vehicle_type, hourly_rate: rate, total_hours: hours, amount: Math.round(hours * rate), sessions: body.p_sessions, created_at: new Date().toISOString() }
      state.jobs.unshift(record); data = [record]
    } else if (url.pathname === '/functions/v1/send-whatsapp') data = { whatsapp_status: 'sent' }
    await route.fulfill({ status: 200, json: data })
  })
  return state
}

test('owner saves profile, changes a rate, adds a vehicle and sees it after reload', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page.getByLabel('Your name').fill('Srinivas Reddy')
  await page.getByLabel('Rate per hour (₹)').fill('1500')
  await page.getByRole('button', { name: 'Add vehicle', exact: true }).click()
  await page.getByLabel('Vehicle name or type').nth(1).fill('JCB')
  await page.getByLabel('Rate per hour (₹)').nth(1).fill('2500')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status')).toHaveText('Your profile and vehicle rates are saved.')
  await page.reload()
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(page.getByLabel('Your name')).toHaveValue('Srinivas Reddy')
  await expect(page.getByLabel('Rate per hour (₹)').first()).toHaveValue('1500')
  await expect(page.getByLabel('Vehicle name or type').nth(1)).toHaveValue('JCB')
  await expect(page.getByLabel('Rate per hour (₹)').nth(1)).toHaveValue('2500')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/owner-profile.png', fullPage: true })
})

test('profile save failure keeps edits available for retry', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page.getByLabel('Your name').fill('New name')
  await page.route('**/rest/v1/owners*', route => route.fulfill({ status: 503, json: { message: 'Offline' } }))
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('alert')).toContainText('Could not save your profile')
  await expect(page.getByLabel('Your name')).toHaveValue('New name')
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()
})

test('owner creates driver access and shares the public invitation link', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Drivers', exact: true }).click()
  await page.getByRole('button', { name: 'Add driver', exact: true }).click()
  await page.getByPlaceholder('Driver name').fill('Ravi')
  await page.getByPlaceholder('9876543210').fill('9848000002')
  await page.getByRole('button', { name: 'Add driver', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Send link to Ravi' })).toBeVisible()
  await expect(page.getByText('https://kisan-go.vercel.app/?invite=9848000002', { exact: true })).toBeVisible()
  const href = await page.getByRole('link', { name: 'Send link on WhatsApp' }).getAttribute('href')
  expect(href).toContain('https://wa.me/919848000002')
  expect(decodeURIComponent(href)).toContain('https://kisan-go.vercel.app/?invite=9848000002')
  expect(state.members[0].status).toBe('invited')
})

test('switching accounts preserves the invite and pre-fills the driver login', async ({ page }) => {
  await setup(page, { role: 'owner' })
  await page.goto('/?invite=9848000002')
  await page.getByRole('button', { name: 'Sign out & use invited number' }).click()
  await expect(page.getByLabel('Mobile number')).toHaveValue('9848000002')
  await expect(page).toHaveURL(/invite=9848000002/)
})

test('a revoked driver is blocked on their next dashboard request', async ({ page }) => {
  const state = await setup(page, { role: 'driver' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Namaste, Ravi' })).toBeVisible()
  // Let the dashboard's own access check finish before revoking.
  await expect(page.getByText(/^No jobs yet/)).toBeVisible()
  state.status = 'revoked'
  await page.getByRole('button', { name: 'My jobs', exact: true }).click()
  await expect(page.getByText('Your access has been removed.', { exact: true })).toBeVisible()
})

test('an owner who is also a driver chooses a side, switches, and the choice is remembered', async ({ page }) => {
  const state = await setup(page, { role: 'both' })
  await page.goto('/')
  await expect(page.getByText('How do you want to open Kisan Go?')).toBeVisible()
  await page.getByRole('button', { name: 'Driver for Lakshmi Farms' }).click()
  await page.getByRole('button', { name: 'Customers' }).click()
  await expect(page.getByText('Ramulu')).toBeVisible()
  expect(state.modes.list_customers_basic).toBe('driver')
  await expect(page.getByRole('button', { name: 'Drivers' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Profile' }).click()
  await page.getByRole('button', { name: 'Switch to my business' }).click()
  await expect(page.getByRole('button', { name: 'Drivers' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Drivers' })).toBeVisible()
  await expect(page.getByText('How do you want to open Kisan Go?')).toHaveCount(0)
  await page.getByRole('button', { name: 'Profile' }).click()
  await expect(page.getByRole('button', { name: 'Switch to driver for Lakshmi Farms' })).toBeVisible()
})

test('an owner opening a driver link with their own number goes straight to the driver side', async ({ page }) => {
  await setup(page, { role: 'both' })
  await page.goto('/?invite=9848000001')
  await expect(page.getByRole('button', { name: 'My jobs' })).toBeVisible()
  await expect(page.getByText('How do you want to open Kisan Go?')).toHaveCount(0)
})

test('driver invite pre-fills the login phone', async ({ page }) => {
  await setup(page, { signedIn: false })
  await page.goto('/?invite=9848000002')
  await expect(page.getByLabel('Mobile number')).toHaveValue('9848000002')
  await expect(page.getByText('You have been added as a driver.', { exact: false })).toBeVisible()
})

test('verified invited driver gets a personal dashboard and can submit a job', async ({ page }) => {
  const state = await setup(page, { role: 'driver', invited: true })
  await page.goto('/?invite=9848000002')
  await expect(page.getByRole('heading', { name: 'Namaste, Ravi' })).toBeVisible()
  await expect(page).not.toHaveURL(/invite=/)
  await expect(page.getByRole('button', { name: 'Money', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Drivers', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/driver-dashboard.png', fullPage: true })
  // The owner changed a rate while this driver was already logged in.
  state.owner.vehicle_rates[0].hourly_rate = 1500
  await page.getByRole('button', { name: 'Choose customer & start work' }).click()
  await page.getByRole('button', { name: 'Start work', exact: true }).click()
  // Start work starts the clock straight away.
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible()
  await expect(page.getByText('₹1,500 / hour', { exact: true })).toBeVisible()
  // Drop the running session and enter the time by hand instead.
  await page.getByRole('button', { name: 'Remove session 1' }).click()
  await expect(page.getByText('LIVE', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add time' }).click()
  await page.locator('input[type="datetime-local"]').nth(0).fill('2026-11-15T10:00')
  await page.locator('input[type="datetime-local"]').nth(1).fill('2026-11-15T11:30')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Bill so far')).toBeVisible()
  await page.getByRole('button', { name: 'Finish & send bill' }).click()
  await expect(page.getByRole('heading', { name: 'Bill sent on WhatsApp' })).toBeVisible()
  await expect(page.getByText('₹2,250', { exact: true })).toBeVisible()
  // Drivers cannot mark a customer as paid.
  await expect(page.getByRole('button', { name: /Mark as paid/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByText('Ramulu', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByText('Ramulu', { exact: true })).toBeVisible()
})

test('a different logged-in account cannot silently consume the invitation', async ({ page }) => {
  await setup(page, { role: 'owner' })
  await page.goto('/?invite=9848000002')
  await expect(page.getByText('This link is for another number')).toBeVisible()
  await expect(page).toHaveURL(/invite=9848000002/)
  await page.getByRole('button', { name: 'Continue with my account' }).click()
  await expect(page.getByRole('button', { name: 'Drivers', exact: true })).toBeVisible()
  await expect(page).not.toHaveURL(/invite=/)
})

test('missing access and revoked access never open the owner signup by default', async ({ page }) => {
  const state = await setup(page, { role: 'driver' })
  state.role = null
  await page.goto('/?invite=9848000002')
  await expect(page.getByText('Driver access not found', { exact: true })).toBeVisible()
  await expect(page.getByText('Set up your profile', { exact: true })).toHaveCount(0)
  state.role = 'driver'; state.status = 'revoked'
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(page.getByText('Your access has been removed.', { exact: true })).toBeVisible()
})

test('failed invite claim offers retry, then resolves to driver dashboard', async ({ page }) => {
  const state = await setup(page, { role: 'driver' })
  state.claimFails = true
  await page.goto('/?invite=9848000002')
  await expect(page.getByText('Could not load your account. Check your connection.')).toBeVisible()
  state.claimFails = false
  await page.getByRole('button', { name: 'Tap to retry' }).click()
  await expect(page.getByRole('heading', { name: 'Namaste, Ravi' })).toBeVisible()
})

test('owner opens a customer, works a job and sends the bill', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Namaste, Srinivas' })).toBeVisible()
  await page.getByRole('button', { name: 'Customers', exact: true }).click()
  await expect(page.getByText('1 farmers')).toBeVisible()
  await page.getByRole('button', { name: /Ramulu/ }).click()
  await expect(page.getByRole('heading', { name: 'Ramulu' })).toBeVisible()
  await page.getByRole('button', { name: /Start work/ }).click()
  await expect(page.getByText('LIVE', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Stop/ }).click()
  await expect(page.getByText('PAUSED', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start again' })).toBeVisible()
  await page.getByRole('button', { name: 'Finish & send bill' }).click()
  await expect(page.getByRole('heading', { name: 'Bill sent on WhatsApp' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Mark as paid/ })).toBeVisible()
  expect(state.jobs).toHaveLength(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Money', exact: true }).click()
  await expect(page.getByText('Who owes the most')).toBeVisible()
  await expect(page.getByText('Waiting 0 days')).toBeVisible()
})
