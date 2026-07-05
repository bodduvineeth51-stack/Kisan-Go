-- Run this in the Supabase SQL Editor.

create table if not exists public.owners (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  phone text,
  vehicle_rates jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.owners enable row level security;

create policy "Owners can view own profile"
  on public.owners for select
  using (auth.uid() = id);

create policy "Owners can insert own profile"
  on public.owners for insert
  with check (auth.uid() = id);

create policy "Owners can update own profile"
  on public.owners for update
  using (auth.uid() = id);
