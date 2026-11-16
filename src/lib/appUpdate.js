// New-version checks for the installed web app. The service worker
// (registerType 'autoUpdate') reloads the page as soon as a new version
// takes over, so we only *look* for one while no work timer is open — a
// reload would lose a running timer.
let busy = 0

// Called by screens that must not be reloaded (the work timer).
export function holdUpdates() {
  busy += 1
  return () => { busy = Math.max(0, busy - 1) }
}

export function watchForUpdates(registration) {
  if (!registration) return
  const check = () => {
    if (busy || document.visibilityState !== 'visible' || !navigator.onLine) return
    registration.update().catch(() => { /* offline or server hiccup — next check */ })
  }
  // Phones resume the installed app from memory instead of reloading it,
  // so a page-load check alone can leave people on an old version for days.
  document.addEventListener('visibilitychange', check)
  setInterval(check, 30 * 60 * 1000)
}
