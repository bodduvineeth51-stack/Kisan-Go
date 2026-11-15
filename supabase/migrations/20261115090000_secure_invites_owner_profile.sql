-- Validate phones at the shared linking point. get_my_role and the service
-- role helper must enforce the same checks as claim_driver_invite.
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
  if v_digits is null or exists (select 1 from public.owners where id = p_user_id) then
    return 0;
  end if;
  update public.memberships
  set user_id = p_user_id, status = 'active'
  where phone = v_digits and role = 'driver' and status = 'invited'
    and (user_id is null or user_id = p_user_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Existing owner updates stay under owners_self RLS. Validate every write,
-- including direct API calls, and keep owner membership names in sync.
create or replace function private.validate_owner_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v jsonb;
  v_type text;
  v_rate numeric;
  v_types text[] := '{}';
begin
  new.name := trim(new.name);
  if new.name is null or length(new.name) < 1 or length(new.name) > 80 then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if jsonb_typeof(new.vehicle_rates) is distinct from 'array' then
    raise exception 'invalid_vehicles' using errcode = '22023';
  end if;
  if jsonb_array_length(new.vehicle_rates) = 0 then
    raise exception 'invalid_vehicles' using errcode = '22023';
  end if;
  for v in select value from jsonb_array_elements(new.vehicle_rates) loop
    if jsonb_typeof(v) is distinct from 'object'
      or jsonb_typeof(v -> 'type') is distinct from 'string'
      or jsonb_typeof(v -> 'hourly_rate') is distinct from 'number' then
      raise exception 'invalid_vehicles' using errcode = '22023';
    end if;
    v_type := trim(v ->> 'type');
    v_rate := (v ->> 'hourly_rate')::numeric;
    if length(v_type) < 1 or length(v_type) > 50 or lower(v_type) = any(v_types) then
      raise exception 'invalid_vehicle_name' using errcode = '22023';
    end if;
    if v_rate <= 0 or v_rate > 10000000 or round(v_rate, 2) <> v_rate then
      raise exception 'invalid_rate' using errcode = '22023';
    end if;
    v_types := array_append(v_types, lower(v_type));
  end loop;
  select jsonb_agg(jsonb_build_object('type', trim(value ->> 'type'),
    'hourly_rate', (value ->> 'hourly_rate')::numeric) order by ordinal)
    into new.vehicle_rates
    from jsonb_array_elements(new.vehicle_rates) with ordinality as items(value, ordinal);
  return new;
end;
$$;

create trigger owners_validate_profile
  before insert or update of name, vehicle_rates on public.owners
  for each row execute function private.validate_owner_profile();

create or replace function private.sync_owner_membership_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.memberships set name = new.name
  where business_id = new.id and role = 'owner';
  return new;
end;
$$;

create trigger owners_sync_membership_name
  after update of name on public.owners
  for each row execute function private.sync_owner_membership_name();

revoke all on function private.link_invites(uuid) from public, anon, authenticated;
revoke all on function private.validate_owner_profile() from public, anon, authenticated;
revoke all on function private.sync_owner_membership_name() from public, anon, authenticated;
