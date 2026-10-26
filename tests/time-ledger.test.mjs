import {before, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;
const uuid = () => crypto.randomUUID();
async function asUser(id, sql, args = []) {
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
  try { return (await db.query(sql, args)).rows[0]?.value; }
  finally { await db.exec('reset role'); }
}
const state = id => asUser(id, 'select public.game_time_state() as value');
const reserve = (user, id, device, run, ms) => asUser(user, 'select public.game_reserve_time($1,$2,$3,$4) as value', [id, device, run, ms]);
const checkpoint = (user, id, device, ms) => asUser(user, 'select public.game_checkpoint_time($1,$2,$3) as value', [id, device, ms]);
const settle = (user, id, device, ms) => asUser(user, 'select public.game_settle_time($1,$2,$3) as value', [id, device, ms]);
async function grant(user, ms, key = uuid()) {
  return (await db.query("select public.game_credit_verified($1,'purchase',$2,$3,'android','test-v1') as value", [user, key, ms])).rows[0].value;
}
async function identity() {
  const user = uuid(), run = uuid(), device = uuid();
  await db.query('insert into auth.users values($1)', [user]);
  await db.query("insert into public.game_runs(id,user_id,level,layout_hash) values($1,$2,1,$3)", [run, user, 'a'.repeat(64)]);
  return {user, run, device};
}
before(async () => {
  db = new PGlite();
  await db.exec("create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
  for (const name of ['202610210001_game.sql','202610210002_catalog_budget.sql','202610260001_time_ledger.sql']) await db.exec(await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));
  await db.query("insert into public.game_catalog(version,level,definition,canonical_layout,layout_hash) values(3,1,'{}',$1,$2)", ['b'.repeat(2704), 'a'.repeat(64)]);
});
after(async () => db?.close());

test('wallet RLS exposes only its owner; grants, reversals and settlement primitive are private', async () => {
  const a = await identity(), b = await identity(); await grant(a.user, 30000); await grant(b.user, 90000);
  assert.equal((await state(a.user)).availableMs, 30000);
  const rows = await asUser(a.user, 'select jsonb_agg(user_id) as value from public.game_credit_lots'); assert.deepEqual(rows, [a.user]);
  for (const sql of [
    'update public.game_credit_lots set granted_ms=999999',
    `select public.game_credit_verified('${a.user}','intro','forged',30000,'web','x')`,
    `select public.game_apply_time('${uuid()}','${a.device}',0,true,false)`,
    `select public.game_reverse_credit('${uuid()}')`,
  ]) await assert.rejects(() => asUser(a.user, sql), /permission denied/);
});

test('verified transaction retries cannot duplicate a grant or change its owner/quantity', async () => {
  const a = await identity(), b = await identity(), transaction = uuid();
  const first = await grant(a.user, 300000, transaction);
  assert.equal(await grant(a.user, 300000, transaction), first);
  await assert.rejects(() => grant(a.user, 900000, transaction), /Credit identity conflict/);
  await assert.rejects(() => grant(b.user, 300000, transaction), /Credit identity conflict/);
  assert.equal((await state(a.user)).availableMs, 300000); assert.equal((await state(b.user)).availableMs, 0);
});

test('reservation atomically holds a bounded amount and permanently marks the run assisted', async () => {
  const a = await identity(), id = uuid(); await grant(a.user, 45000);
  const result = await reserve(a.user, id, a.device, a.run, 30000);
  assert.equal(result.wallet.availableMs, 15000); assert.equal(result.wallet.reservedMs, 30000);
  assert.equal((await db.query('select assisted from public.game_runs where id=$1', [a.run])).rows[0].assisted, true);
  const retry = await reserve(a.user, id, a.device, a.run, 30000); assert.equal(retry.wallet.availableMs, 15000);
  await assert.rejects(() => reserve(a.user, uuid(), uuid(), a.run, 15000), /existing activation/);
  await assert.rejects(() => reserve(a.user, id, a.device, a.run, 15000), /identity conflict/);
});

test('concurrent reservation attempts cannot spend the same balance twice', async () => {
  const a = await identity(); await grant(a.user, 30000);
  // PGlite serializes submitted transactions; both requests run the actual SQL
  // locks/constraints. Multi-connection hosted Postgres contention remains a
  // separate integration check, not a claim made by this single-connection test.
  const results = await Promise.allSettled([reserve(a.user, uuid(), a.device, a.run, 30000), reserve(a.user, uuid(), uuid(), a.run, 30000)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await state(a.user)).reservedMs, 30000); assert.equal((await state(a.user)).availableMs, 0);
});

test('partial checkpoint and idempotent settlement preserve every unused millisecond', async () => {
  const a = await identity(), id = uuid(); await grant(a.user, 30000); await reserve(a.user, id, a.device, a.run, 30000);
  await checkpoint(a.user, id, a.device, 12345); await checkpoint(a.user, id, a.device, 12345);
  await checkpoint(a.user, id, a.device, 12000); // late checkpoint cannot rewind consumption
  const done = await settle(a.user, id, a.device, 13001);
  assert.equal(done.reservation.consumed_ms, 13001); assert.equal(done.reservation.released_ms, 16999);
  assert.equal(done.wallet.availableMs, 16999); assert.equal(done.wallet.reservedMs, 0);
  assert.equal((await settle(a.user, id, a.device, 0)).wallet.availableMs, 16999);
  assert.equal((await checkpoint(a.user, id, a.device, 0)).wallet.availableMs, 16999);
  const sums = (await db.query("select kind,sum(amount_ms)::integer as ms from public.game_time_ledger where user_id=$1 group by kind", [a.user])).rows;
  assert.equal(sums.find(row => row.kind === 'consume').ms, 13001); assert.equal(sums.find(row => row.kind === 'release').ms, 16999);
});

test('account/device binding and amount bounds reject forged consumption and foreign runs', async () => {
  const a = await identity(), b = await identity(), id = uuid(); await grant(a.user, 30000);
  await assert.rejects(() => reserve(a.user, id, a.device, b.run, 15000), /Active run required/);
  await assert.rejects(() => reserve(a.user, id, a.device, a.run, 30001), /Invalid time reservation/);
  await reserve(a.user, id, a.device, a.run, 15000);
  await assert.rejects(() => checkpoint(b.user, id, a.device, 1000), /Unknown time reservation/);
  await assert.rejects(() => settle(a.user, id, b.device, 1000), /Wrong activation device/);
  for (const invalid of [-1, 15001, null]) await assert.rejects(() => checkpoint(a.user, id, a.device, invalid), /Invalid consumed time/);
  assert.equal((await state(a.user)).reservedMs, 15000);
});

test('crash recovery holds authority until lease expiry and charges only acknowledged time', async () => {
  const a = await identity(), id = uuid(); await grant(a.user, 30000); await reserve(a.user, id, a.device, a.run, 30000);
  await checkpoint(a.user, id, a.device, 4321);
  await assert.rejects(() => asUser(a.user, 'select public.game_recover_time($1) as value', [id]), /lease to end/);
  await db.query("update public.game_time_reservations set lease_until=now()-interval '1 second' where id=$1", [id]);
  await assert.rejects(() => checkpoint(a.user, id, a.device, 6000), /lease expired/);
  const recovered = await asUser(a.user, 'select public.game_recover_time($1) as value', [id]);
  assert.equal(recovered.reservation.consumed_ms, 4321); assert.equal(recovered.wallet.availableMs, 25679);
  assert.equal(recovered.reservation.recovery, true);
  // The old authorization can no longer consume/re-reserve its released time.
  assert.equal((await settle(a.user, id, a.device, 30000)).reservation.consumed_ms, 4321);
});

test('refund reverses only that lot and records consumed refunded value without a negative balance', async () => {
  const a = await identity(), id = uuid(); const refunded = await grant(a.user, 30000); await grant(a.user, 90000);
  await reserve(a.user, id, a.device, a.run, 15000); await settle(a.user, id, a.device, 12000);
  await db.query('select public.game_reverse_credit($1)', [refunded]);
  await db.query('select public.game_reverse_credit($1)', [refunded]);
  const wallet = await state(a.user); assert.equal(wallet.availableMs, 90000); assert.equal(wallet.refundedConsumedMs, 12000);
  assert.equal(wallet.reservedMs, 0);
});

test('refund during an activation revokes renewal but never makes held credit spendable twice', async () => {
  const a = await identity(), id = uuid(), lot = await grant(a.user, 30000); await grant(a.user, 60000);
  await reserve(a.user, id, a.device, a.run, 30000); await checkpoint(a.user, id, a.device, 1000);
  await db.query('select public.game_reverse_credit($1)', [lot]);
  const check = await checkpoint(a.user, id, a.device, 1500); assert.equal(check.authorizationValid, false);
  const result = await settle(a.user, id, a.device, 2000);
  assert.equal(result.wallet.availableMs, 60000); assert.equal(result.wallet.refundedConsumedMs, 2000);
  const record = (await db.query('select * from public.game_credit_lots where id=$1', [lot])).rows[0];
  assert.equal(Number(record.reversed_ms), 28000); assert.equal(Number(record.held_ms), 0);
});

test('smaller remainders remain usable and restoring a consumed transaction does not replenish it', async () => {
  const a = await identity(), id = uuid(), transaction = uuid(); await grant(a.user, 1001, transaction);
  await reserve(a.user, id, a.device, a.run, 1001); await settle(a.user, id, a.device, 1001);
  await grant(a.user, 1001, transaction); assert.equal((await state(a.user)).availableMs, 0);
  await assert.rejects(() => reserve(a.user, uuid(), a.device, a.run, 1), /Not enough/);
});
