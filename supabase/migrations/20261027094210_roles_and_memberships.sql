-- Phase 2: owner / driver roles inside one business.
--
-- Backward-compatible with the web app (which still runs on production with
-- direct table access as the owner):
--   * owners, customers and work_records keep every column and the existing
--     owner policies (owner_id = auth.uid()) unchanged;
--   * new columns are nullable with defaults;
--   * drivers get NO table policies. Everything they may do goes through the
--     SECURITY DEFINER functions below, which re-check that the caller is an
--     ACTIVE driver on every call, so a revoked driver loses access on their
--     very next request.
--
-- The one change that can fail on existing data is the unique customer phone
-- index (section 4): it fails if a business already has two customers with the
-- same phone number. See the check query in that section.

-- Internal helpers live in a schema the API does not expose.
create schema if not exists private;
revoke all on schema private from public;


-- 1. Phone numbers ----------------------------------------------------------
-- Compare phones by their last 10 digits, so "+91 98480 12345", "919848012345"
-- and "9848012345" are the same number. Returns null if there are fewer than 10.
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(d) >= 10 then right(d, 10) end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) as digits
$$;


-- 2. Memberships ------------------------------------------------------------
-- One row per person per business. business_id is the owner's user id
-- (owners.id), the same value customers.owner_id and work_records.owner_id hold.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.owners (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  phone text,
  name text not null,
  role text not null check (role in ('owner', 'driver')),
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  constraint memberships_phone_format check (phone is null or phone ~ '^\d{10}$'),
  constraint memberships_driver_has_phone check (role = 'owner' or phone is not null),
  constraint memberships_owner_is_business check (
    role <> 'owner' or (user_id = business_id and status = 'active')
  ),
  constraint memberships_active_has_user check (status <> 'active' or user_id is not null)
);

create unique index memberships_phone_per_business on public.memberships (business_id, phone);
create unique index memberships_one_owner_per_business on public.memberships (business_id)
  where role = 'owner';
-- A phone can be live (invited or active) in only one place: one business per
-- driver, and an owner's phone can't be invited as someone else's driver.
create unique index memberships_one_live_per_phone on public.memberships (phone)
  where status <> 'revoked';
create unique index memberships_one_active_per_user on public.memberships (user_id)
  where status = 'active';

alter table public.memberships enable row level security;

-- Owners can list the people in their own business (Manage Drivers).
-- All changes go through add_driver / revoke_driver.
create policy memberships_owner_read on public.memberships
  for select to authenticated
  using (business_id = (select auth.uid()));

revoke all on public.memberships from anon;
revoke insert, update, delete, truncate on public.memberships from authenticated;

-- Backfill: every existing owner gets an active owner membership.
insert into public.memberships (business_id, user_id, phone, name, role, status)
select o.id, o.id, public.normalize_phone(coalesce(o.phone, u.phone)), o.name, 'owner', 'active'
from public.owners o
left join auth.users u on u.id = o.id
on conflict do nothing;

-- New owners (from either app) get their owner membership automatically.
-- A phone that is already a driver can't also sign up as an owner.
create or replace function private.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone(
    coalesce(new.phone, (select u.phone from auth.users u where u.id = new.id))
  );
begin
  if exists (
    select 1 from public.memberships m
    where m.role = 'driver' and m.status <> 'revoked'
      and (m.user_id = new.id or m.phone = v_phone)
  ) then
    raise exception 'phone_is_driver' using errcode = 'P0001';
  end if;

  insert into public.memberships (business_id, user_id, phone, name, role, status)
  values (new.id, new.id, v_phone, new.name, 'owner', 'active');
  return new;
end;
$$;

create trigger owners_add_membership
  after insert on public.owners
  for each row execute function private.add_owner_membership();


-- 3. Who created each record --------------------------------------------------
alter table public.customers
  add column created_by uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.work_records
  add column created_by uuid default auth.uid() references auth.users (id) on delete set null;

-- Everything that exists today was created by the owner.
update public.customers set created_by = owner_id where created_by is null;
update public.work_records set created_by = owner_id where created_by is null;

create index customers_created_by_idx on public.customers (created_by);
create index work_records_created_by_idx on public.work_records (created_by);

-- created_by is always the logged-in user and never changes afterwards, so a
-- driver's "my records" list can be trusted.
create or replace function private.stamp_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create trigger customers_stamp_created_by
  before insert or update on public.customers
  for each row execute function private.stamp_created_by();
create trigger work_records_stamp_created_by
  before insert or update on public.work_records
  for each row execute function private.stamp_created_by();


-- 4. One customer per phone per business ------------------------------------
-- NOT backward-compatible if data already has duplicates: this fails if a
-- business has two customers with the same number. Check before production:
--   select owner_id, public.normalize_phone(phone), count(*)
--   from public.customers group by 1, 2 having count(*) > 1;
create unique index customers_phone_per_business
  on public.customers (owner_id, public.normalize_phone(phone));


-- 5. Who is calling? ----------------------------------------------------------
-- The caller's business and role: the owner of a business, or an ACTIVE
-- driver. Invited and revoked drivers get no row.
create or replace function private.caller_context()
returns table (business_id uuid, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, 'owner'::text from public.owners o where o.id = auth.uid()
  union all
  select m.business_id, 'driver'::text
  from public.memberships m
  where m.user_id = auth.uid() and m.role = 'driver' and m.status = 'active'
  limit 1
$$;

-- Turn a pending invite into an active membership once that phone has an
-- account. Owners are never linked as drivers.
create or replace function private.link_invites(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_count integer;
begin
  select public.normalize_phone(u.phone) into v_phone from auth.users u where u.id = p_user_id;
  if v_phone is null or exists (select 1 from public.owners o where o.id = p_user_id) then
    return 0;
  end if;

  update public.memberships
  set user_id = p_user_id, status = 'active'
  where phone = v_phone and role = 'driver' and status = 'invited';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- 6. API functions -------------------------------------------------------------
-- Called by the firebase-login edge function (service role) right after login.
create or replace function public.link_driver_invite(p_user_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.link_invites(p_user_id)
$$;

-- What the app needs after login. No row = no business yet (owner sign-up).
-- Also links a pending invite, for a driver who was already logged in when the
-- owner added them.
create or replace function public.get_my_role()
returns table (
  role text,
  status text,
  business_id uuid,
  business_name text,
  name text,
  vehicle_rates jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  perform private.link_invites(auth.uid());

  return query
    select 'owner'::text, 'active'::text, o.id, o.name, o.name, o.vehicle_rates
    from public.owners o where o.id = auth.uid();
  if found then
    return;
  end if;

  -- Revoked drivers only learn that they are revoked, nothing about the business.
  return query
    select 'driver'::text, m.status, m.business_id,
           case when m.status = 'active' then o.name end,
           m.name,
           case when m.status = 'active' then o.vehicle_rates else '[]'::jsonb end
    from public.memberships m
    join public.owners o on o.id = m.business_id
    where m.user_id = auth.uid() and m.role = 'driver' and m.status in ('active', 'revoked')
    order by (m.status = 'active') desc, m.created_at desc
    limit 1;
end;
$$;

-- Owner adds a driver by name and phone: an 'invited' membership that becomes
-- 'active' when that phone logs in. Adding a revoked driver again restores them.
create or replace function public.add_driver(p_name text, p_phone text)
returns table (id uuid, name text, phone text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := public.normalize_phone(p_phone);
  v_row public.memberships;
begin
  if not exists (select 1 from public.owners o where o.id = v_owner) then
    raise exception 'only_owner' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.owners o left join auth.users u on u.id = o.id
    where public.normalize_phone(coalesce(o.phone, u.phone)) = v_phone
  ) then
    raise exception 'phone_is_owner' using errcode = 'P0001';
  end if;

  select * into v_row from public.memberships m
  where m.business_id = v_owner and m.phone = v_phone;

  if found and v_row.status <> 'revoked' then
    return query select v_row.id, v_row.name, v_row.phone, v_row.status;
    return;
  end if;

  if exists (select 1 from public.memberships m where m.phone = v_phone and m.status <> 'revoked') then
    raise exception 'phone_in_use' using errcode = 'P0001';
  end if;

  if found then
    update public.memberships m
    set status = case when m.user_id is not null then 'active' else 'invited' end,
        name = v_name
    where m.id = v_row.id
    returning * into v_row;
  else
    insert into public.memberships (business_id, phone, name, role, status)
    values (v_owner, v_phone, v_name, 'driver', 'invited')
    returning * into v_row;
  end if;

  return query select v_row.id, v_row.name, v_row.phone, v_row.status;
end;
$$;

-- Owner revokes a driver. Takes effect on the driver's next request.
create or replace function public.revoke_driver(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.owners o where o.id = auth.uid()) then
    raise exception 'only_owner' using errcode = '42501';
  end if;

  update public.memberships m
  set status = 'revoked'
  where m.id = p_membership_id and m.business_id = auth.uid() and m.role = 'driver';
  if not found then
    raise exception 'driver_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Customer list for drivers: name and phone only, never amounts or paid status.
create or replace function public.list_customers_basic()
returns table (id uuid, name text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.phone
  from public.customers c
  join private.caller_context() ctx on ctx.business_id = c.owner_id
  order by c.name
$$;

-- "<name> already exists — use this customer?" check. No row = new customer.
create or replace function public.find_customer_by_phone(p_phone text)
returns table (id uuid, name text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.phone
  from public.customers c
  join private.caller_context() ctx on ctx.business_id = c.owner_id
  where public.normalize_phone(c.phone) = public.normalize_phone(p_phone)
  limit 1
$$;

-- Add a customer, or return the existing one with that phone (already_exists).
create or replace function public.add_customer(p_name text, p_phone text)
returns table (id uuid, name text, phone text, already_exists boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := public.normalize_phone(p_phone);
  v_rec public.customers;
begin
  select ctx.business_id into v_business from private.caller_context() ctx;
  if v_business is null then
    raise exception 'no_access' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  return query
    select c.id, c.name, c.phone, true from public.customers c
    where c.owner_id = v_business and public.normalize_phone(c.phone) = v_phone;
  if found then
    return;
  end if;

  begin
    insert into public.customers (owner_id, name, phone, is_paid)
    values (v_business, v_name, v_phone, false)
    returning * into v_rec;
    return query select v_rec.id, v_rec.name, v_rec.phone, false;
  exception when unique_violation then
    -- Someone added the same phone a moment ago.
    return query
      select c.id, c.name, c.phone, true from public.customers c
      where c.owner_id = v_business and public.normalize_phone(c.phone) = v_phone;
  end;
end;
$$;

-- Submit a finished job. Hours and amount are worked out here from the
-- owner's rate, never taken from the phone, with the web app's exact maths
-- (TimerScreen.jsx calcTotals/handleSubmit):
--   each session rounds UP to whole minutes; hours = minutes / 60;
--   total_hours = Math.round(hours * 100) / 100; amount = Math.round(hours * rate).
-- float8 + floor(x + 0.5) reproduces JavaScript's number maths and Math.round.
create or replace function public.submit_work_record(
  p_customer_id uuid,
  p_vehicle_type text,
  p_sessions jsonb
)
returns table (
  id uuid,
  customer_id uuid,
  vehicle_type text,
  hourly_rate numeric,
  sessions jsonb,
  total_hours numeric,
  amount numeric,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_rate numeric;
  v_sessions jsonb;
  v_minutes numeric;
  v_valid boolean;
  v_hours float8;
  v_rec public.work_records;
begin
  select ctx.business_id into v_business from private.caller_context() ctx;
  if v_business is null then
    raise exception 'no_access' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.owner_id = v_business
  ) then
    raise exception 'customer_not_found' using errcode = 'P0002';
  end if;

  select (v ->> 'hourly_rate')::numeric into v_rate
  from public.owners o, jsonb_array_elements(o.vehicle_rates) v
  where o.id = v_business and v ->> 'type' = p_vehicle_type
  limit 1;
  if v_rate is null or v_rate <= 0 then
    raise exception 'unknown_vehicle' using errcode = '22023';
  end if;

  if jsonb_typeof(p_sessions) is distinct from 'array' or jsonb_array_length(p_sessions) = 0 then
    raise exception 'no_sessions' using errcode = '22023';
  end if;

  begin
    select
      jsonb_agg(jsonb_build_object('start', s ->> 'start', 'stop', s ->> 'stop') order by n),
      sum(ceil(extract(epoch from ((s ->> 'stop')::timestamptz - (s ->> 'start')::timestamptz)) / 60)),
      bool_and((s ->> 'stop')::timestamptz > (s ->> 'start')::timestamptz)
    into v_sessions, v_minutes, v_valid
    from jsonb_array_elements(p_sessions) with ordinality as t(s, n);
  exception when others then
    raise exception 'bad_sessions' using errcode = '22023';
  end;
  if not v_valid then
    raise exception 'bad_sessions' using errcode = '22023';
  end if;

  v_hours := v_minutes::float8 / 60;

  insert into public.work_records (
    customer_id, owner_id, vehicle_type, hourly_rate, sessions,
    total_hours, amount, whatsapp_status
  )
  values (
    p_customer_id, v_business, p_vehicle_type, v_rate, v_sessions,
    (floor(v_hours * 100 + 0.5) / 100)::numeric,
    floor(v_hours * v_rate::float8 + 0.5)::numeric,
    'pending'
  )
  returning * into v_rec;

  return query select v_rec.id, v_rec.customer_id, v_rec.vehicle_type, v_rec.hourly_rate,
                      v_rec.sessions, v_rec.total_hours, v_rec.amount, v_rec.created_at;
end;
$$;

-- A driver's own submitted jobs (with the cost they already saw on submit),
-- never the customer's paid status and never anyone else's jobs.
create or replace function public.my_work_records()
returns table (
  id uuid,
  customer_id uuid,
  customer_name text,
  vehicle_type text,
  hourly_rate numeric,
  sessions jsonb,
  total_hours numeric,
  amount numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.customer_id, c.name, w.vehicle_type, w.hourly_rate, w.sessions,
         w.total_hours, w.amount, w.created_at
  from public.work_records w
  join private.caller_context() ctx on ctx.business_id = w.owner_id
  join public.customers c on c.id = w.customer_id
  where w.created_by = auth.uid()
  order by w.created_at desc
$$;


-- 7. Who may call what ------------------------------------------------------
-- Supabase grants EXECUTE on new public functions to everyone by default.
revoke execute on function public.link_driver_invite(uuid) from public, anon, authenticated;
grant execute on function public.link_driver_invite(uuid) to service_role;

revoke execute on function public.get_my_role() from public, anon;
revoke execute on function public.add_driver(text, text) from public, anon;
revoke execute on function public.revoke_driver(uuid) from public, anon;
revoke execute on function public.list_customers_basic() from public, anon;
revoke execute on function public.find_customer_by_phone(text) from public, anon;
revoke execute on function public.add_customer(text, text) from public, anon;
revoke execute on function public.submit_work_record(uuid, text, jsonb) from public, anon;
revoke execute on function public.my_work_records() from public, anon;

grant execute on function public.get_my_role() to authenticated;
grant execute on function public.add_driver(text, text) to authenticated;
grant execute on function public.revoke_driver(uuid) to authenticated;
grant execute on function public.list_customers_basic() to authenticated;
grant execute on function public.find_customer_by_phone(text) to authenticated;
grant execute on function public.add_customer(text, text) to authenticated;
grant execute on function public.submit_work_record(uuid, text, jsonb) to authenticated;
grant execute on function public.my_work_records() to authenticated;
