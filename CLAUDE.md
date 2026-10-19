# Project: Kisan Go — work & billing app for farm vehicle owners

## What it is
Vehicle owners (tractor / harvester / JCB) rent machines to farmer
customers and charge by the hour. Today this runs on pen and paper:
drivers note start/stop times, owners re-copy everything into a second
notebook at night, and collecting payments means flipping through pages
for 100+ customers. Kisan Go replaces all of it.

## Users
Multiple vehicle owners (multi-tenant SaaS). Each owner sees only their
own data. Login = phone number + OTP (users are farmers; many don't use
email). First login collects: name, vehicle types, hourly rate per
vehicle — this creates the owner account. Later logins go straight to
the dashboard.

## Core features (build in this order)
1. Phone OTP auth (Supabase), owner profile form on first login
2. Customer cards: name, phone, paid/unpaid toggle, delete card
   (season-end cleanup), instant search
3. Work timer: select customer, big Start/Stop button. One job can have
   MULTIPLE sessions (e.g. 12:00–12:30, then 1:00–1:30 = 1 hr total).
   Show session list + running total. Also allow manual session entry.
4. Billing: on Submit, total hours × owner's hourly rate = amount;
   save as a work_record
5. WhatsApp automation: on work_record insert, a Supabase edge function
   automatically sends a WhatsApp message to the CUSTOMER's number with
   name, total hours, rate, amount. Store whatsapp_status on the
   record; show "✓ Sent on WhatsApp" or a Retry button on the card.
6. Earnings summary screen: total earned, total pending (today /
   season) — per owner
7. Voice-based record entry: Web Speech API, Telugu (te-IN) and
   English (en-IN); driver speaks details, app fills the card
8. i18n: full UI language toggle, English + Telugu

## Data model (Supabase / Postgres)
owners:       id, phone, name, vehicles (jsonb), rates (jsonb)
customers:    id, owner_id, name, phone, is_paid (bool)
work_records: id, customer_id, sessions (jsonb array of
              {start, stop}), total_hours, amount, whatsapp_status

Row-Level Security ON for all tables: every query is scoped to the
logged-in owner's id. Owner A must never see Owner B's data.

## Stack
- Frontend: React + Vite + Tailwind CSS, mobile-first
- Backend: Supabase (auth, Postgres, edge functions)
- WhatsApp: Meta WhatsApp Cloud API test number (or Twilio sandbox
  as fallback) via Supabase edge function
- Deploy: Vercel

## Environment & secrets
- Supabase URL and anon key are in .env (VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY). Never hardcode keys. Keep .env in
  .gitignore.
- WhatsApp API tokens live in Supabase edge function secrets, never
  in frontend code.
- Login SMS is sent by Firebase Phone Auth, not Supabase. The Firebase
  web config is in .env (VITE_FIREBASE_API_KEY, _AUTH_DOMAIN,
  _PROJECT_ID, _APP_ID). The `firebase-login` edge function needs the
  secret FIREBASE_PROJECT_ID.
- For demo login, add test phone numbers with fixed codes in the
  Firebase console (Authentication → Sign-in method → Phone).

## Build progress

### Phase 1 — Auth + Owner profile ✅ (complete)
Files: `src/lib/supabaseClient.js`, `src/pages/Login.jsx`, `src/pages/ProfileSetup.jsx`, `src/App.jsx`

**Schema notes for future sessions:**
- `owners` table lives in `public` schema; primary key `id` is the Supabase auth UID (uuid), so no separate join needed — `auth.uid() = id` is the RLS check.
- Vehicle types and rates are stored together as a single `vehicle_rates jsonb` column — an array of `{type: string, hourly_rate: number}` objects. CLAUDE.md's data model shows `vehicles` and `rates` as separate columns; ignore that — the code and table both use `vehicle_rates`.
- RLS policy name is `owners_self`, covers all operations (SELECT / INSERT / UPDATE / DELETE).
- Login flow: Firebase sends and checks the SMS code (`src/lib/firebaseClient.js`), then `supabase/functions/firebase-login` verifies the Firebase ID token and returns a one-time token hash that `Login.jsx` redeems with `supabase.auth.verifyOtp`. The session is a normal Supabase session, so `auth.uid()` and all RLS policies are unchanged. Each phone maps to a Supabase user with stand-in email `<digits>@phone.kisango.invalid`.
- `firebase-login` must be deployed with `--no-verify-jwt` (it is called before login).
- Supabase anon key format is `sb_publishable_…` (new Supabase key format) — this is correct, not a truncated key.
- App routing in `App.jsx`: `session === undefined` → loading, `session === null` → Login, `owner === null` → ProfileSetup, owner present → Dashboard stub.

### Phase 2 — Customer cards ✅ (complete)
Files: `src/pages/Dashboard.jsx`, `src/components/CustomerCard.jsx`

**Schema notes:**
- `customers` table: `id` (uuid, gen_random_uuid()), `owner_id` (uuid → owners.id), `name` (text), `phone` (text, 10 digits, no +91 prefix), `is_paid` (bool, default false), `created_at` (timestamptz).
- RLS policy `customers_owner` covers all ops: `owner_id = auth.uid()`.
- Phone stored without country code (+91 shown only in UI).

**Implementation notes:**
- `CustomerForm` component lives inside `Dashboard.jsx` (not a separate file) — it's the add/edit bottom-sheet modal.
- Paid/unpaid toggle uses optimistic update with rollback on error.
- Delete uses `window.confirm` before firing — deliberate, for season-end cleanup use case.
- Search filters in-memory via `useMemo` (no extra DB round-trips).
- `owner.id` (the auth UID) is passed as `owner_id` on insert — RLS enforces this.

### Phase 3 — Work timer + billing ✅ (complete)
Files: `src/pages/TimerScreen.jsx` (new), `src/App.jsx` (activeJob routing), `src/pages/Dashboard.jsx` (fetches work_records), `src/components/CustomerCard.jsx` (Start job + records display)

**Schema — work_records table:**
```
id              uuid  PK default gen_random_uuid()
customer_id     uuid  → customers.id ON DELETE CASCADE
owner_id        uuid  → owners.id ON DELETE CASCADE  (denormalized for RLS)
vehicle_type    text
hourly_rate     numeric
sessions        jsonb  [{start: ISO8601, stop: ISO8601}, …]
total_hours     numeric (2 dp)
amount          numeric (rounded to nearest rupee)
whatsapp_status text   default 'pending'
created_at      timestamptz default now()
```
RLS policy `work_records_owner`: `owner_id = auth.uid()` for all ops.

**Implementation notes:**
- Navigation is state-based (no router): `activeJob` state in `App.jsx`. When non-null → render `TimerScreen`; null → render `Dashboard`. Dashboard remounts on return, refetching fresh data automatically.
- Vehicle auto-selected when owner has exactly one vehicle type; selector shown when multiple.
- Live timer uses `setInterval` on `activeStart` (Date), cleans up on unmount.
- `total_hours` = sum of (stop−start) across sessions in milliseconds ÷ 3,600,000, rounded to 2 dp.
- `amount` = `Math.round(total_hours × hourly_rate)` (nearest rupee).
- Manual session uses `datetime-local` inputs pre-filled to current local time via a `localDatetimeValue()` helper (avoids UTC offset bug with `toISOString().slice(0,16)`).
- Dashboard fetches customers and work_records in parallel (`Promise.all`); records are filtered per-card client-side.
- CustomerCard shows last 3 records (newest first from DB).

### Phase 4 — WhatsApp automation ✅ (complete)
Files: `supabase/functions/send-whatsapp/index.ts` (edge function), `src/pages/TimerScreen.jsx` (calls function post-submit), `src/pages/Dashboard.jsx` (retry handler), `src/components/CustomerCard.jsx` (status + retry UI)

**Provider:** Twilio WhatsApp sandbox (free-form `Body`, no content templates needed within 24h session window)

**Secrets stored in Supabase (never in frontend):**
- `TWILIO_ACCOUNT_SID` — Twilio account SID (ACxxx…)
- `TWILIO_AUTH_TOKEN` — Twilio auth token
- `TWILIO_WHATSAPP_FROM` — optional override; defaults to `whatsapp:+14155238886` (sandbox)
- `TWILIO_WHATSAPP_TEMPLATE_EN` / `TWILIO_WHATSAPP_TEMPLATE_TE` — optional Twilio Content SIDs (HX…) of the approved bill templates. When set for the message language, the function sends the template with variables 1–5 (name, vehicle, hours, rate, amount); when unset it sends free-form text, which only the sandbox allows.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase into every edge function — do NOT set these manually

**Implementation notes:**
- Edge function uses `SUPABASE_SERVICE_ROLE_KEY` (auto env var) to update `work_records.whatsapp_status` — this bypasses RLS intentionally (the function is the trusted writer here).
- Submit flow in TimerScreen: phase 1 "Saving…" → DB insert → phase 2 "Sending WhatsApp…" → edge function → navigate back. WhatsApp failure does not block navigation; user can retry from dashboard.
- `whatsapp_status` values: `'pending'` (initial), `'sending'` (optimistic during retry), `'sent'`, `'failed'`.
- Retry handler lives in Dashboard (has access to `customers` array to look up customer name/phone by `record.customer_id`).
- CustomerCard uses a `WhatsAppStatus` sub-component: shows ✓ Sent / Sending… / ↺ Retry.

**CLI deployment — project ref: `pvcqrshhgfafkmfxigig`**
See step-by-step instructions in the session where this was built.

### Phase 5 — Earnings summary ✅ (complete)
Files: `src/pages/EarningsScreen.jsx` (new), `src/components/BottomNav.jsx` (new), `src/App.jsx` (activeTab state), `src/pages/Dashboard.jsx` (BottomNav + fixed Add button)

**Implementation notes:**
- All aggregates computed client-side from existing `work_records` + `customers` — no new tables or DB queries.
- "Collected" = sum of amounts for records whose customer has `is_paid = true`. "Pending" = the rest. This is per the data model where `is_paid` is a customer-level flag.
- "Today" is filtered by `created_at` compared against local-time midnight boundaries (not UTC), so IST is handled correctly.
- Pending collections list groups by customer, sums all their record amounts, excludes paid customers, sorts by total descending.
- Navigation: `activeTab` state in `App.jsx` (`'customers' | 'earnings'`). `BottomNav` is rendered inside both Dashboard and EarningsScreen (not in App.jsx) so each screen controls its own bottom area.
- Dashboard: Add button is `fixed bottom-16` (above the `h-16` nav bar); scroll container has `pb-32` so last card is never hidden.
- TimerScreen has no BottomNav — it's a full-screen overlay layer.

### Phase 6 — Voice-based record entry ✅ (complete)
Files: `src/lib/voiceParser.js` (new), `src/components/VoiceEntry.jsx` (new), `src/pages/TimerScreen.jsx` (voice button + handler added)

**Implementation notes:**
- Uses `window.SpeechRecognition || window.webkitSpeechRecognition` — Chrome only (Android Chrome works on mobile). Non-Chrome shows a friendly unsupported message inside the sheet.
- Language toggle on the sheet: EN (en-IN) / TE (te-IN). Default is te-IN.
- `interimResults: true` — live transcript shown while speaking.
- Mic button: tap to start, tap again to stop early; auto-stops on pause. Pulsing ring animation while listening.
- Parse result (`parseTranscript`): extracts `customer` (fuzzy Levenshtein), `vehicle` (alias map includes common Telugu script + English mispellings), `start`/`stop` ISO strings from time-range patterns.
- Time patterns handled: `"12:00 to 2:30"`, `"12 to 2"`, `"10 AM to 2 PM"`, Telugu `"12 నుండి 2:30 వరకు"` (Telugu separators normalised to "to" before parsing). Auto-PM: if stop < start in 12h context, +12h applied.
- Confirmation card (always shown before applying): shows what was heard, warns if customer name differs from current job, editable vehicle selector + start/stop time inputs. Never auto-submits.
- `onConfirm({ vehicle, session })` in TimerScreen: sets vehicle if parsed, adds session to list, closes sheet. User then proceeds to Submit as normal.
- Parse failures are graceful: fields left blank (amber border) for user to fill manually.

### Phase 7 — i18n: English ⇄ Telugu ✅ (complete)
Files: `src/lib/i18n.js` (new), `src/context/LangContext.jsx` (new), `src/main.jsx`, `src/App.jsx`, all pages + all components + edge function updated.

**Implementation notes:**
- Plain translations object in `src/lib/i18n.js` — flat keys, both `en` and `te` objects. No library dependency.
- `LangProvider` in `src/context/LangContext.jsx` wraps the whole app (via `src/main.jsx`). Persists choice in `localStorage` key `kisan_lang` — survives page reload.
- `useTrans()` hook returns `{ t, lang, setLang }`. `t(key, vars?)` does key lookup with `{placeholder}` substitution; falls back to English key if Telugu key missing.
- `LangToggle` component exported from `LangContext.jsx`. Two variants: `variant="dark"` (for green headers — white/green-100 text) and `variant="light"` (for white pages — gray text).
- Toggle visible on: Login page (top-right, light variant), Profile Setup page (top-right, light), Dashboard header (dark), EarningsScreen header (dark).
- TimerScreen has no separate lang toggle — uses whatever was chosen in Dashboard.
- VoiceEntry has its own **speech-language** toggle (EN/TE for the microphone, not for UI text). Renamed `lang` → `speechLang` inside VoiceEntry to avoid shadowing `useTrans()`. Speech lang defaults to match app lang (`appLang === 'te'` → `'te-IN'`).
- WhatsApp edge function: receives `lang` field in request body (passed by both TimerScreen submit and Dashboard retry). `buildMessage(lang, ...)` returns either Telugu or English message. Default is `'en'` if field absent.
- Telugu translations use natural farmer language: "బాకీ" (baaki = outstanding), "వసూలు" (vasulu = collection), "చెల్లించారు" (they paid), "పని మొదలు" (start work), etc. Formal textbook Telugu avoided.
- Numbers and ₹ amounts stay as digits in both languages (per spec).

### Phase 8 — Polish + Deploy ✅ (complete)
Files changed: `index.html`, `public/favicon.svg`, `src/index.css`, `src/App.jsx`, `src/pages/Dashboard.jsx`, `src/pages/EarningsScreen.jsx`, `src/lib/i18n.js`, `vercel.json` (new)

**Polish:**
- `index.html`: title fixed to "Kisan Go", `theme-color` meta (#16a34a green), `viewport-fit=cover` for notched phones, Apple PWA meta tags.
- `public/favicon.svg`: Replaced the default Vite lightning bolt with a simplified green tractor on a green rounded square.
- `src/index.css`: Added `overflow-x: hidden` on `html, body` to prevent horizontal scroll on mobile.
- `src/App.jsx`: Loading screen is now a branded green splash (app name + Telugu sub-line + white spinner) instead of plain text.
- `src/pages/Dashboard.jsx`: Loading state now shows a green spinner; error banner has a "Tap to retry" button that calls `fetchAll`.
- `src/pages/EarningsScreen.jsx`: Same spinner + retry improvements; `fetchAll` extracted from `useEffect` so the retry button can call it.
- `src/lib/i18n.js`: Added `retry` key (EN: "Tap to retry" / TE: "మళ్ళీ ప్రయత్నించు").
- `vercel.json`: SPA rewrite rule — all paths serve `/index.html`.

**Deploy:**
- Vercel auto-detects Vite; build command `npm run build`, output dir `dist`.
- Env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be set in Vercel dashboard — `.env` is never committed.

### Phase 9 — Android app (Capacitor) 🚧 (set up, not yet built on a device)
Files: `capacitor.config.json` (new), `android/` (generated native project), `src/main.jsx`, `vite.config.js`, `src/components/VoiceEntry.jsx`, `package.json`

**Implementation notes:**
- Same React code runs in the Android WebView; app id `com.kisango.app`, served from `https://localhost`.
- `npm run android:sync` = `vite build` + `cap sync android` — run after every web change, then build in Android Studio (`npm run android:open`).
- PWA service worker is registered from `main.jsx` only when NOT `Capacitor.isNativePlatform()` (`injectRegister: false` in vite config).
- Voice entry: Android WebView has no Web Speech API, so on native `VoiceEntry` uses `@capacitor-community/speech-recognition` (`partialResults: false` → no live interim text on native). Web path unchanged.
- Firebase phone login still uses the web reCAPTCHA flow; `localhost` must be in Firebase → Authentication → Settings → Authorized domains.
- iOS not added yet (needs full Xcode + CocoaPods; Firebase web reCAPTCHA won't work under iOS's `capacitor://` scheme — would need native Firebase auth).

## Rules
- All UI must follow `kisan-design/DESIGN.md` (colours, fonts, spacing,
  shapes, icons) and match the reference screens in `kisan-design/screens/`.
  Use the theme tokens in `src/index.css` (`bg-primary`, `text-muted`, …),
  not raw Tailwind greys/greens.
- App display name is "Kisan Go" — use it in the UI header, login
  screen, and as the WhatsApp message signature ("— Sent via Kisan Go")
- Mobile-first UI: big touch targets, high contrast (used outdoors in
  sunlight by non-tech-savvy users), minimal screens, simple wording
- Timer screen must be usable in 2 taps: pick customer → Start
- Commit after every working feature with a clear message
- Handle errors visibly: loading states, empty states, failed
  WhatsApp sends get a Retry button
- Write SQL migrations for any schema change; don't edit tables
  ad hoc

  