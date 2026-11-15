import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Execute the actual migrations in PostgreSQL, with the small auth surface
// they use. No network, production credentials, or persistent test records.
test('invitation lifecycle, tenant isolation, owner profile and billing rates', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema extensions;
    create table auth.users (id uuid primary key, phone text, phone_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
    $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
    grant usage on schema auth to authenticated, anon, service_role;
  `)
  for (const file of (await readdir(new URL('../supabase/migrations/', import.meta.url))).sort()) {
    let sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')
    // Managed Supabase extensions/publication are not used by these functions.
    sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS[^;]+;/g, '')
      .replace(/ALTER PUBLICATION[^;]+;/g, '')
    await db.exec(sql)
  }
  await db.exec('set row_security = on')
  const ids = Object.fromEntries(['owner', 'driver', 'otherOwner', 'unverified', 'foreign', 'otherDriver', 'noInvite'].map((name, i) => [name, `00000000-0000-4000-b000-${String(i + 1).padStart(12, '0')}`]))
  const phones = ['919848000001', '919848000002', '919848000003', '919848000004', '19848000005', '919848000006', '919848000007']
  for (const [i, [name, id]] of Object.entries(ids).entries()) {
    await db.query('insert into auth.users values ($1, $2, $3)', [id, phones[i], name === 'unverified' ? null : new Date().toISOString()])
  }
  // mode 'driver' = the web app's  x-kisan-mode: driver  header.
  const asMode = (user, mode, sql, params = []) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ids[user], role: 'authenticated' })])
    await tx.query("select set_config('request.headers', $1, true)", [mode ? JSON.stringify({ 'x-kisan-mode': mode }) : ''])
    await tx.exec('set local role authenticated')
    return (await tx.query(sql, params)).rows
  })
  const as = (user, sql, params = []) => asMode(user, null, sql, params)
  for (const name of ['owner', 'otherOwner']) {
    await as(name, `insert into public.owners(id, phone, name, vehicle_rates) values ($1, $2, $3, $4)`,
      [ids[name], phones[Object.keys(ids).indexOf(name)], name, JSON.stringify([{ type: 'Tractor', hourly_rate: 1200 }])])
  }
  let membership, customer, firstBill
  await t.test('owner invites; verified phone claims once and opens the driver role', async () => {
    ;[membership] = await as('owner', "select * from public.add_driver('Driver One', '+91 98480 00002')")
    assert.equal(membership.status, 'invited')
    assert.equal((await as('driver', 'select public.claim_driver_invite() as count'))[0].count, 1)
    assert.equal((await as('driver', 'select public.claim_driver_invite() as count'))[0].count, 0)
    const [role] = await as('driver', 'select * from public.get_my_role()')
    assert.equal(role.role, 'driver'); assert.equal(role.status, 'active'); assert.equal(role.business_id, ids.owner)
  })
  await t.test('get_my_role cannot bypass verification or Indian country-code checks', async () => {
    await as('owner', "select * from public.add_driver('Unverified', '9848000004')")
    await as('owner', "select * from public.add_driver('Foreign', '9848000005')")
    for (const user of ['unverified', 'foreign']) {
      assert.equal((await as(user, 'select public.claim_driver_invite() as count'))[0].count, 0)
      assert.deepEqual(await as(user, 'select * from public.get_my_role()'), [])
    }
    assert.deepEqual(await as('noInvite', 'select * from public.get_my_role()'), [])
    await assert.rejects(as('driver', "select * from public.add_driver('Someone', '9848000007')"), /only_owner/)
  })
  await t.test('driver dashboard sees only its own jobs and cannot read owner tables', async () => {
    ;[customer] = await as('driver', "select * from public.add_customer('Ramulu', '9848099999')")
    ;[firstBill] = await as('driver', 'select * from public.submit_work_record($1, $2, $3)', [customer.id, 'Tractor', JSON.stringify([{ start: '2026-11-15T06:00:00Z', stop: '2026-11-15T07:30:00Z' }])])
    assert.equal(Number(firstBill.amount), 1800)
    assert.equal((await as('driver', 'select * from public.my_work_records()')).length, 1)
    for (const table of ['owners', 'customers', 'work_records', 'memberships']) {
      assert.deepEqual(await as('driver', `select * from public.${table}`), [])
    }
    assert.deepEqual(await as('otherOwner', 'select * from public.work_records'), [])
    await as('owner', "select * from public.add_driver('Second Driver', '9848000006')")
    await as('otherDriver', 'select public.claim_driver_invite()')
    assert.deepEqual(await as('otherDriver', 'select * from public.my_work_records()'), [])
    await assert.rejects(as('otherOwner', 'select * from public.submit_work_record($1, $2, $3)', [customer.id, 'Tractor', JSON.stringify([{ start: '2026-11-15T06:00:00Z', stop: '2026-11-15T07:30:00Z' }])]), /customer_not_found/)
  })
  await t.test('owner can add vehicles and edit rates; existing bills never change', async () => {
    const rates = [{ type: 'Tractor', hourly_rate: 1500 }, { type: 'JCB', hourly_rate: 2500 }]
    const [owner] = await as('owner', 'update public.owners set name = $1, vehicle_rates = $2 where id = $3 returning *', ['Srinivas', JSON.stringify(rates), ids.owner])
    assert.equal(owner.name, 'Srinivas')
    assert.deepEqual(owner.vehicle_rates, rates)
    const [role] = await as('driver', 'select * from public.get_my_role()')
    assert.equal(role.business_name, 'Srinivas'); assert.deepEqual(role.vehicle_rates, rates)
    const [bill] = await as('driver', 'select * from public.submit_work_record($1, $2, $3)', [customer.id, 'JCB', JSON.stringify([{ start: '2026-11-15T08:00:00Z', stop: '2026-11-15T09:00:00Z' }])])
    assert.equal(Number(bill.amount), 2500)
    const [old] = await as('owner', 'select * from public.work_records where id = $1', [firstBill.id])
    assert.equal(Number(old.hourly_rate), 1200); assert.equal(Number(old.amount), 1800)
    assert.equal((await as('owner', "select name from public.memberships where role = 'owner'"))[0].name, 'Srinivas')
    assert.deepEqual(await as('driver', "update public.owners set name = 'Changed' where id = $1 returning id", [ids.owner]), [])
    assert.deepEqual(await as('otherOwner', "update public.owners set name = 'Changed' where id = $1 returning id", [ids.owner]), [])
  })
  await t.test('database rejects invalid rates and duplicate vehicle names', async () => {
    for (const rates of [[], [{ type: 'Tractor', hourly_rate: -1 }], [{ type: 'Tractor', hourly_rate: 0 }], [{ type: 'Tractor', hourly_rate: 1.001 }], [{ type: 'Tractor', hourly_rate: 100 }, { type: ' tractor ', hourly_rate: 200 }]]) {
      await assert.rejects(as('owner', 'update public.owners set vehicle_rates = $1 where id = $2', [JSON.stringify(rates), ids.owner]), /invalid_/)
    }
  })
  await t.test('revocation blocks work, re-opening an invite does not restore access, owner can restore', async () => {
    await as('owner', 'select public.revoke_driver($1)', [membership.id])
    await as('driver', 'select public.claim_driver_invite()')
    assert.equal((await as('driver', 'select * from public.get_my_role()'))[0].status, 'revoked')
    assert.deepEqual(await as('driver', 'select * from public.my_work_records()'), [])
    await assert.rejects(as('driver', "select * from public.add_customer('Blocked', '9848099998')"), /no_access/)
    assert.equal((await as('owner', "select * from public.add_driver('Driver One', '9848000002')"))[0].status, 'active')
    assert.equal((await as('driver', 'select * from public.get_my_role()'))[0].status, 'active')
    assert.equal((await as('driver', 'select * from public.my_work_records()')).length, 2)
  })
  await t.test('an owner can be invited as a driver by another owner, never by themselves', async () => {
    await assert.rejects(as('owner', "select * from public.add_driver('Me', '+91 98480 00001')"), /phone_is_self/)
    await assert.rejects(as('owner', "select * from public.add_driver('Me', '9848000001')"), /phone_is_self/)
    const [invite] = await as('owner', "select * from public.add_driver('Other Owner', '9848000003')")
    assert.equal(invite.status, 'invited')
    assert.equal((await as('otherOwner', 'select public.claim_driver_invite() as count'))[0].count, 1)

    // Owner side first by default; driver side first when the app asks for it.
    const roles = await as('otherOwner', 'select * from public.get_my_role()')
    assert.deepEqual(roles.map(r => `${r.role}/${r.status}`), ['owner/active', 'driver/active'])
    assert.equal(roles[1].business_id, ids.owner)
    const driverFirst = await asMode('otherOwner', 'driver', 'select * from public.get_my_role()')
    assert.deepEqual(driverFirst.map(r => r.role), ['driver', 'owner'])

    // The mode decides which business the driver functions work on.
    assert.deepEqual(await as('otherOwner', 'select * from public.list_customers_basic()'), [])
    assert.deepEqual((await asMode('otherOwner', 'driver', 'select * from public.list_customers_basic()')).map(c => c.name), ['Ramulu'])
    const [bill] = await asMode('otherOwner', 'driver', 'select * from public.submit_work_record($1, $2, $3)', [customer.id, 'Tractor', JSON.stringify([{ start: '2026-11-16T06:00:00Z', stop: '2026-11-16T07:00:00Z' }])])
    assert.equal(Number(bill.amount), 1500)
    assert.equal((await as('owner', 'select owner_id, created_by from public.work_records where id = $1', [bill.id]))[0].created_by, ids.otherOwner)
    assert.deepEqual(await as('otherOwner', 'select * from public.work_records where id = $1', [bill.id]), [], 'own owner tables never show the other business')

    // Removing them as a driver leaves their own business untouched and never
    // lets driver mode fall back to it.
    await as('owner', 'select public.revoke_driver($1)', [invite.id])
    assert.equal((await asMode('otherOwner', 'driver', 'select * from public.get_my_role()'))[0].status, 'revoked')
    await assert.rejects(asMode('otherOwner', 'driver', "select * from public.add_customer('Blocked', '9848099997')"), /no_access/)
    assert.equal((await as('otherOwner', "select * from public.add_customer('Own Customer', '9848099996')"))[0].already_exists, false)
    assert.equal((await as('otherOwner', 'select * from public.get_my_role()'))[0].role, 'owner')
  })
})
