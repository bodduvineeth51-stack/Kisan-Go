# Kisan Go

Mobile work and billing app for farm vehicle owners and their drivers. React,
Vite, Tailwind, Firebase phone authentication, Supabase, and Capacitor Android.
Public web app: https://kisan-go.vercel.app

## Local development

```sh
npm install
npm run dev
```

Use `.env.example` for the required variable names; never commit credentials.
This checkout uses `.env.local` for **kisan-go-dev**
(`ctsohixfzmbzmbahvhda`). `.env` contains the production configuration.
Vite loads `.env.local` for builds too: a successful local build does not imply
it targets production. Check the intended environment before publishing.

## Owner and driver flows

- Owner → Drivers → Add driver → send/copy their invitation link. WhatsApp opens
  with a message; the owner taps Send. Links only prefill the phone number.
- The driver verifies that number with Firebase OTP. Supabase claims their
  invitation using the verified phone and opens their own Home dashboard,
  Customers, My jobs, and Profile. No manual driver signup is needed.
- A link opened under another account offers switching accounts or continuing
  with that account. Failed claims show Retry, never the owner signup by mistake.
- Removed drivers lose database access on their next request. The app also
  refreshes driver access/vehicles when returning to the app and every 30 seconds
  while visible. Opening an old link does not restore revoked access.
- Owner → Profile: edit name, vehicle names/types, and hourly rates; add/remove
  vehicles (at least one is required). Login phone is read-only. Duplicate names,
  zero/negative rates, and invalid values are rejected in both UI and database.
- Rates are loaded again before a driver starts a job. The database uses the
  current rate at submission, while old work records retain their original rate
  and amount. Names can distinguish machines, e.g. “Tractor 1” and “Tractor 2”.

For Android, set `VITE_PUBLIC_APP_URL` to the public HTTPS deployment using the
**same database** as that Android build. Production uses
`https://kisan-go.vercel.app`. A development database needs a separate development
web deployment; a production link cannot claim a development-only invitation.
The web app otherwise uses its current public HTTPS origin. Localhost URLs are
not offered as shareable links.

## Verification

```sh
npm test
npm run test:browser
npm run lint
npm run build
```

- `npm test` executes the actual SQL migrations in an isolated PGlite PostgreSQL
  database, with a minimal Supabase auth fixture. It covers invitations,
  verification, role boundaries, revocation/restoration, profiles and bill rates.
- Browser tests use Chrome at 390×844 and mocked Supabase responses/session
  fixtures. They cover sharing links, account switching, missing/revoked access,
  claim retries, profile persistence/errors, and driver job submission.
  These do **not** send real SMS/WhatsApp messages or prove provider delivery.
- For a linked development Supabase instance, the pgTAP regression suite is in
  `supabase/tests/claim_driver_invite.test.sql`. It rolls back its fixtures.

## Backend rollout

The new migration is `20261115090000_secure_invites_owner_profile.sql`. Apply all
missing migrations in order. It hardens the shared invite-linking helper,
validates owner profile writes, and synchronizes owner membership names.

On November 15, **kisan-go-dev** (`ctsohixfzmbzmbahvhda`) was restored from its
paused state and the CLI was explicitly relinked to it after reauthentication.
All four repository migrations are applied there. The hosted pgTAP suite passed
all 28 assertions and rolled back its fixtures. The `send-whatsapp` function was
deployed to dev; the existing `firebase-login` deployment was retained.

**Verify the project before any remote operation.** Explicitly target dev with
`--project-ref ctsohixfzmbzmbahvhda`; never use an unchecked saved link. Run database
CLI commands sequentially to avoid competing temporary login credentials.
Keep the original roles migration unchanged because another client shares its
migration history. Production rollout must include the roles and claim migrations
before deploying the frontend; check for duplicate customer phones first as
described in the roles migration.

`firebase-login` requires the server secret `FIREBASE_PROJECT_ID` and disabled
gateway JWT verification (configured in `supabase/config.toml`). Firebase must
authorize the website domain. Dev currently has `FIREBASE_PROJECT_ID`, but lacks
the Twilio secrets needed for automatic bill delivery. `send-whatsapp` checks
the caller itself. Confirm real SMS login and bill delivery with test accounts
before release. Production and the public Vercel frontend have not been updated
by this rollout. No remote migration or deployment is performed by the npm test
commands.

## Android

```sh
npm run android:sync
npm run android:open
```

Device testing is still required for Firebase reCAPTCHA and native speech input.
The design system and reference screens are in `kisan-design/`; `CLAUDE.md`
contains the earlier implementation history.
