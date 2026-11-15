import { localDigits } from './phone.js'

// Driver access link: the app's address with the driver's number attached, e.g.
//   https://<app>/?invite=9848012345
// The link is not a key. It only opens the login screen with that number
// filled in; the driver still confirms it with a one-time code, and
// claim_driver_invite then links them from the VERIFIED phone on the server.
// So a forwarded link gives nobody else access.
const PARAM = 'invite'

// On the web this is simply where the app is running. The Android (Capacitor)
// build runs on https://localhost, so it needs VITE_PUBLIC_APP_URL set to the
// public web address.
function appBaseUrl() {
  const configured = import.meta.env?.VITE_PUBLIC_APP_URL
  return configured || window.location.origin
}

export function driverInviteLink(phone, baseUrl = appBaseUrl()) {
  const digits = localDigits(phone)
  if (!digits) return null
  try {
    const url = new URL(baseUrl)
    // localhost in a native build cannot be opened on the driver's phone.
    if (url.protocol !== 'https:' || /^(localhost|127\.|\[::1\])/.test(url.hostname)) return null
    url.search = ''
    url.hash = ''
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/`
    url.searchParams.set(PARAM, digits)
    return url.toString()
  } catch {
    return null
  }
}

// The invited number from the address bar, or null.
export function readInvitePhone() {
  try {
    return localDigits(new URLSearchParams(window.location.search).get(PARAM))
  } catch {
    return null
  }
}

// Drop the invite number from the address bar once the person is in, so it
// doesn't come back on the login screen after they log out.
export function clearInviteParam() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(PARAM)) return
    url.searchParams.delete(PARAM)
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  } catch {
    // Address bar can't be changed here; harmless.
  }
}
