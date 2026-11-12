-- Web app: link a pending driver invite for the logged-in user.
--
-- The web app calls this right after login (and on every app open), before it
-- decides which screen to show. It never takes a phone number from the client:
-- the phone comes from auth.users, and only if that phone has been verified
-- (phone_confirmed_at is set — firebase-login creates users with
-- phone_confirm: true after Firebase has checked the SMS code).
--
-- Supabase stores phones without the plus sign ("919848012345"). We accept
-- 91 + 10 digits, 0 + 10 digits or bare 10 digits, i.e. one Indian mobile
-- number +91XXXXXXXXXX, and refuse anything else.
--
-- The actual linking is the existing Phase 2 function link_driver_invite,
-- which takes the user id and re-reads that same phone from auth.users. It
-- never links an owner as a driver. Returns the number of invites linked
-- (0 or 1).
create or replace function public.claim_driver_invite()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_digits text;
begin
  if v_uid is null then
    raise exception 'not_logged_in' using errcode = '42501';
  end if;

  select regexp_replace(coalesce(u.phone, ''), '\D', '', 'g')
  into v_digits
  from auth.users u
  where u.id = v_uid and u.phone_confirmed_at is not null;

  -- +91XXXXXXXXXX → its 10 local digits; anything else is not a valid phone.
  v_digits := case
    when v_digits ~ '^91\d{10}$' then right(v_digits, 10)
    when v_digits ~ '^0\d{10}$'  then right(v_digits, 10)
    when v_digits ~ '^\d{10}$'   then v_digits
  end;
  if v_digits is null then
    return 0;
  end if;

  return public.link_driver_invite(v_uid);
end;
$$;

revoke execute on function public.claim_driver_invite() from public, anon;
grant execute on function public.claim_driver_invite() to authenticated;
