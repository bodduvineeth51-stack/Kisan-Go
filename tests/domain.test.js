import test from 'node:test'
import assert from 'node:assert/strict'
import { driverInviteLink } from '../src/lib/invite.js'
import { localDigits } from '../src/lib/phone.js'
import { validateVehicles } from '../src/lib/vehicles.js'
import translations from '../src/lib/i18n.js'

test('invite links normalize phones and use the public HTTPS app', () => {
  for (const number of ['9848012345', '+91 98480 12345', '919848012345', '09848012345']) {
    assert.equal(driverInviteLink(number, 'https://kisan-go.vercel.app'), 'https://kisan-go.vercel.app/?invite=9848012345')
  }
  assert.equal(driverInviteLink('123', 'https://kisan-go.vercel.app'), null)
  for (const url of ['https://localhost', 'http://localhost:5173', 'javascript:alert(1)', 'bad-url']) {
    assert.equal(driverInviteLink('9848012345', url), null)
  }
  assert.equal(localDigits('+1 234 567 8901'), null)
})

test('vehicle edits reject ambiguous names and invalid rates', () => {
  assert.equal(validateVehicles([{ type: 'Tractor', hourly_rate: '1200.50' }, { type: 'JCB', hourly_rate: 2500 }]), null)
  assert.equal(validateVehicles([{ type: 'Tractor', hourly_rate: 100 }, { type: ' tractor ', hourly_rate: 200 }]), 'duplicateVehicle')
  for (const rate of ['', 0, -1, Infinity, 'abc', 1.001, 10000001]) {
    assert.equal(validateVehicles([{ type: 'Tractor', hourly_rate: rate }]), 'validRateErr')
  }
  assert.equal(validateVehicles([]), 'selectVehicleErr')
})

test('every English translation has Telugu text with the same placeholders', () => {
  assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations.te).sort())
  for (const key of Object.keys(translations.en)) {
    const vars = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()
    assert.deepEqual(vars(translations.en[key]), vars(translations.te[key]), key)
  }
})
