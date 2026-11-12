import { localDigits } from './phone'

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
  const configured = import.meta.env.VITE_PUBLIC_APP_URL
  return String(configured || window.location.origin).replace(/\/+$/, '')
}

export function driverInviteLink(phone) {
  const digits = localDigits(phone)
  return digits ? `${appBaseUrl()}/?${PARAM}=${digits}` : appBaseUrl()
}

// The invited number from the address bar, or null.
export function readInvitePhone() {
  try {
    return localDigits(new URLSearchParams(window.location.search).get(PARAM))
  } catch {
    return null
  }
}
