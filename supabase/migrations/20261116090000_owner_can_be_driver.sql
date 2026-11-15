-- An owner can also be invited as a driver for ANOTHER owner's business.
--
-- Before: a phone could hold only one live role, so add_driver refused any
-- owner's number (phone_is_owner) and an owner's login was never linked to a
-- driver invite. Now:
--   * add_driver accepts any valid number except the calling owner's own
--     (phone_is_self). One live driver invite per phone is still the rule.
--   * link_invites links invites for owners too (still only from a verified
--     Indian phone), never into the person's own business.
--   * A person who is both picks which side the app opens. The app sends the
--     header  x-kisan-mode: driver  while showing the driver screens.
--     - get_my_role returns one row per role; the row for the requested side
--       comes first, so apps that read only the first row keep working.
--     - caller_context (used by every driver function) answers ONLY with an
--       active driver membership in driver mode. A revoked driver therefore
--       never falls back to their own business by accident.
--   The header can only choose between the caller's own memberships; it
--   grants nothing by itself.
-- A driver signing up as an owner is still refused (phone_is_driver).

-- 1. One live role per phone/login → one live DRIVER role per phone/login.
drop index if exists public.memberships_one_live_per_phone;
create unique index memberships_one_live_driver_per_phone on public.memberships (phone)
  where role = 'driver' and status <> 'revoked';

drop index if exists public.memberships_one_active_per_user;
create unique index memberships_one_active_driver_per_user on public.memberships (user_id)
  where role = 'driver' and status = 'active';


-- 2. Which side the app is showing (header set by the web app).
create or replace function private.requested_mode()
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when (nullif(current_setting('request.headers', true), '')::json ->> 'x-kisan-mode') = 'driver'
      then 'driver' else 'owner'
  end
$$;


-- 3. Who is calling?
create or replace function private.caller_context()
returns table (business_id uuid, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select ctx.business_id, ctx.role from (
    select o.id as business_id, 'owner'::text as role, 1 as pri
    from public.owners o
    where o.id = auth.uid() and private.requested_mode() = 'owner'
    union all
    select m.business_id, 'driver'::text, 2
    from public.memberships m
    where m.user_id = auth.uid() and m.role = 'driver' and m.status = 'active'
  ) ctx
  order by ctx.pri
  limit 1
$$;


-- 4. Link invites (owners included), only from a verified Indian phone.
create or replace function private.link_invites(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_digits text;
  v_count integer;
begin
  select regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') into v_digits
  from auth.users u where u.id = p_user_id and u.phone_confirmed_at is not null;
  v_digits := case
    when v_digits ~ '^91\d{10}$' then right(v_digits, 10)
    when v_digits ~ '^0\d{10}$' then right(v_digits, 10)
    when v_digits ~ '^\d{10}$' then v_digits
  end;
  if v_digits is null then
    return 0;
  end if;
  update public.memberships
  set user_id = p_user_id, status = 'active'
  where phone = v_digits and role = 'driver' and status = 'invited'
    and business_id <> p_user_id
    and (user_id is null or user_id = p_user_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- 5. What the app needs after login: one row per role, requested side first.
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
declare
  v_driver_first boolean := private.requested_mode() = 'driver';
begin
  if auth.uid() is null then
    return;
  end if;
  perform private.link_invites(auth.uid());

  return query
    select r.role, r.status, r.business_id, r.business_name, r.name, r.vehicle_rates
    from (
      select 'owner'::text as role, 'active'::text as status, o.id as business_id,
             o.name as business_name, o.name as name, o.vehicle_rates,
             case when v_driver_first then 2 else 1 end as pri, now() as created_at
      from public.owners o where o.id = auth.uid()
      union all
      -- Revoked drivers only learn that they are revoked, nothing about the business.
      (select 'driver'::text, m.status, m.business_id,
              case when m.status = 'active' then o.name end,
              m.name,
              case when m.status = 'active' then o.vehicle_rates else '[]'::jsonb end,
              case when v_driver_first then 1 else 2 end, m.created_at
       from public.memberships m
       join public.owners o on o.id = m.business_id
       where m.user_id = auth.uid() and m.role = 'driver' and m.status in ('active', 'revoked')
       order by (m.status = 'active') desc, m.created_at desc
       limit 1)
    ) r
    order by r.pri;
end;
$$;


-- 6. Add a driver: any valid number except the owner's own.
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
    where o.id = v_owner
      and v_phone in (public.normalize_phone(o.phone), public.normalize_phone(u.phone))
  ) then
    raise exception 'phone_is_self' using errcode = 'P0001';
  end if;

  select * into v_row from public.memberships m
  where m.business_id = v_owner and m.phone = v_phone and m.role = 'driver';

  if found and v_row.status <> 'revoked' then
    return query select v_row.id, v_row.name, v_row.phone, v_row.status;
    return;
  end if;

  if exists (
    select 1 from public.memberships m
    where m.phone = v_phone and m.role = 'driver' and m.status <> 'revoked'
  ) then
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


revoke all on function private.requested_mode() from public, anon, authenticated;
revoke all on function private.link_invites(uuid) from public, anon, authenticated;
revoke execute on function public.get_my_role() from public, anon;
revoke execute on function public.add_driver(text, text) from public, anon;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.add_driver(text, text) to authenticated;
