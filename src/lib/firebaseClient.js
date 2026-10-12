import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

let auth = null

// Firebase is only used to send and check the SMS code on the login screen,
// so it is set up on first use rather than at import time.
export function getFirebaseAuth() {
  if (auth) return auth
  if (Object.values(firebaseConfig).some((v) => !v)) {
    throw new Error('Missing VITE_FIREBASE_* values in .env')
  }
  auth = getAuth(initializeApp(firebaseConfig))
  return auth
}
