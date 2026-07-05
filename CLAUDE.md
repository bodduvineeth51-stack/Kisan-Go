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
- For demo login, Supabase test phone numbers with fixed OTP codes
  are configured in the dashboard (no real SMS needed).

## Rules
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

  