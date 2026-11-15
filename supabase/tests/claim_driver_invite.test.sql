-- Web app role tests: claim_driver_invite + what a driver can see directly.
-- Run against kisan-go-dev only:  supabase test db --linked
-- One transaction, rolled back at the end: no test users or data are left behind.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Run one statement as an app user (role authenticated, auth.uid() = p_user).
create function pg_temp.as_user(p_user uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_prev text := current_user;
  v_result text;
begin
  perform set_config('request.jwt.claims',
    coalesce(json_build_object('sub', p_user, 'role', 'authenticated')::text, ''), true);
  perform set_config('role', 'authenticated', true);
  begin
    execute p_sql into v_result;
  exception when others then
    perform set_config('role', v_prev, true);
    perform set_config('request.jwt.claims', '', true);
    raise;
  end;
  perform set_config('role', v_prev, true);
  perform set_config('request.jwt.claims', '', true);
  return v_result;
end;
$$;

-- People (phones in Supabase's format: no plus sign)
--   O  owner                         D1 invited driver, verified phone
--   D2 never invited, verified       U  invited driver, phone NOT verified
--   X  invited driver, foreign phone (not +91)
insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, created_at, updated_at) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '915551110001', now(), now(), now()),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '915551110002', now(), now(), now()),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '915551110003', now(), now(), now()),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '915551110004', null,  now(), now()),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '15551110005',  now(), now(), now());

select pg_temp.as_user('00000000-0000-4000-b000-000000000001', $$
  insert into public.owners (id, phone, name, vehicle_rates)
  values ('00000000-0000-4000-b000-000000000001', '+915551110001', 'Owner O',
          '[{"type":"Tractor","hourly_rate":1200}]')
  returning id $$);
select pg_temp.as_user('00000000-0000-4000-b000-000000000001', $$select status from public.add_driver('Driver One', '+91 55511 10002')$$);
select pg_temp.as_user('00000000-0000-4000-b000-000000000001', $$select status from public.add_driver('Unverified', '5551110004')$$);
select pg_temp.as_user('00000000-0000-4000-b000-000000000001', $$select status from public.add_driver('Foreign', '5551110005')$$);


-- 1. claim_driver_invite -------------------------------------------------------
select throws_like(
  $$select public.claim_driver_invite()$$,
  '%not_logged_in%', 'claim: refuses a call with no logged-in user');

select is(pg_temp.as_user('00000000-0000-4000-b000-000000000002', $$select public.claim_driver_invite()::text$$),
  '1', 'claim: driver 1 (verified phone, invited) is linked');
select is((select status from public.memberships where phone = '5551110002'),
  'active', 'claim: driver 1 membership is now active');
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000002', $$select public.claim_driver_invite()::text$$),
  '0', 'claim: calling again is harmless');

select is(pg_temp.as_user('00000000-0000-4000-b000-000000000003', $$select public.claim_driver_invite()::text$$),
  '0', 'claim: driver 2 (never invited) links nothing');
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000003', $$select count(*)::text from public.get_my_role()$$),
  '0', 'claim: driver 2 has no role → owner profile form');

select is(pg_temp.as_user('00000000-0000-4000-b000-000000000004', $$select public.claim_driver_invite()::text$$),
  '0', 'claim: phone not verified (phone_confirmed_at null) → not linked');
select is((select status from public.memberships where phone = '5551110004'),
  'invited', 'claim: unverified invite stays invited');
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000004', $$select count(*)::text from public.get_my_role()$$),
  '0', 'routing: get_my_role cannot bypass phone verification');

select is(pg_temp.as_user('00000000-0000-4000-b000-000000000005', $$select public.claim_driver_invite()::text$$),
  '0', 'claim: non-+91 phone → not linked');
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000005', $$select count(*)::text from public.get_my_role()$$),
  '0', 'routing: get_my_role cannot link a foreign number by its last 10 digits');

select is(pg_temp.as_user('00000000-0000-4000-b000-000000000001', $$select public.claim_driver_invite()::text$$),
  '0', 'claim: an owner is never linked as a driver');

select ok(
  not has_function_privilege('anon', 'public.claim_driver_invite()', 'execute'),
  'claim: anon cannot call it');
select is(
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
   where oid = 'public.claim_driver_invite()'::regprocedure),
  true, 'claim: SECURITY DEFINER with a fixed, empty search_path');


-- 2. Routing ---------------------------------------------------------------------
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000002', $$select role || '/' || status from public.get_my_role()$$),
  'driver/active', 'routing: driver 1 → driver screens');
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000001', $$select role || '/' || status from public.get_my_role()$$),
  'owner/active', 'routing: owner → dashboard');


-- 3. A driver sees no amounts and no paid status by direct table access ----------
select pg_temp.as_user('00000000-0000-4000-b000-000000000002', $$select id::text from public.add_customer('Ramulu', '5551119001')$$);
select pg_temp.as_user('00000000-0000-4000-b000-000000000002', $$
  select id::text from public.submit_work_record(
    (select id from public.list_customers_basic() where phone = '5551119001'),
    'Tractor',
    '[{"start":"2026-11-12T06:00:00Z","stop":"2026-11-12T07:30:00Z"}]')$$);

select is((select amount::text from public.work_records where created_by = '00000000-0000-4000-b000-000000000002'),
  '1800', 'amount: worked out by the database (1.5 h × ₹1200)');
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000002', $$select count(*)::text from public.customers$$),
  '0', 'driver: select * from customers returns nothing');
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000002', $$select count(*)::text from public.work_records$$),
  '0', 'driver: select * from work_records returns nothing');
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000002', $$select count(*)::text from public.my_work_records()$$),
  '1', 'driver: sees their own job through my_work_records');

select is(pg_temp.as_user('00000000-0000-4000-b000-000000000001',
    $$select count(*)::text from public.work_records where created_by = '00000000-0000-4000-b000-000000000002'$$),
  '1', 'owner: sees the driver''s job directly (for "Recorded by")');
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000001',
    $$select name from public.memberships where user_id = '00000000-0000-4000-b000-000000000002'$$),
  'Driver One', 'owner: can read the driver''s name for "Recorded by"');


-- 4. Revoke ------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-b000-000000000001', $$
  update public.owners set name = 'Updated Owner',
    vehicle_rates = '[{"type":"Tractor","hourly_rate":1500},{"type":"JCB","hourly_rate":2500}]'
  where id = '00000000-0000-4000-b000-000000000001' returning name $$);
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000002', $$select business_name from public.get_my_role()$$),
  'Updated Owner', 'profile: driver sees the updated owner name');
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000002', $$select jsonb_array_length(vehicle_rates)::text from public.get_my_role()$$),
  '2', 'profile: driver sees the newly added vehicle');
select is((select amount::text from public.work_records where created_by = '00000000-0000-4000-b000-000000000002'),
  '1800', 'profile: editing rates never changes a saved bill');
select throws_like(
  $$select pg_temp.as_user('00000000-0000-4000-b000-000000000001', $q$
    update public.owners set vehicle_rates = '[{"type":"Tractor","hourly_rate":0}]'
    where id = '00000000-0000-4000-b000-000000000001' returning name $q$)$$,
  '%invalid_rate%', 'profile: database rejects a zero rate');

select pg_temp.as_user('00000000-0000-4000-b000-000000000001',
  $$select count(*)::text from public.revoke_driver((select id from public.memberships where phone = '5551110002'))$$);
select is(pg_temp.as_user('00000000-0000-4000-b000-000000000002', $$select role || '/' || status from public.get_my_role()$$),
  'driver/revoked', 'revoke: driver 1 → access removed screen');
select throws_like(
  $$select pg_temp.as_user('00000000-0000-4000-b000-000000000002', $q$select id::text from public.add_customer('Late', '5551119002')$q$)$$,
  '%no_access%', 'revoke: driver 1''s next write is refused');


select * from finish();
rollback;
