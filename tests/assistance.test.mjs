import test from 'node:test';
import assert from 'node:assert/strict';
import {AssistanceSession} from '../dist/assistance.js';
import {FixedSimulation, PaddleInput} from '../dist/controls.js';
import {Game} from '../dist/engine.js';
const owner = '11111111-1111-4111-8111-111111111111', device = '22222222-2222-4222-8222-222222222222', run = '33333333-3333-4333-8333-333333333333';
const near = (a, b, eps = 1e-7) => assert(Math.abs(a - b) < eps, `${a} != ${b}`);
function fixture() {
  let clock = 0, account = owner, failure = null, requestDelay = 0;
  const rows = new Map(), calls = [], values = new Map(), stops = [];
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
  // Contract fake for client state/timing only. Financial correctness is tested
  // separately through the real migration in time-ledger.test.mjs.
  const api = async (action, args) => {
    calls.push({action, args});
    if (failure) throw failure;
    if (action === 'state') return {availableMs: 30000, reservedMs: 0, pending: [...rows.values()].filter(row => !row.settled_at).map(row => ({id: row.id})), serverNow: new Date(clock).toISOString()};
    const start = clock;
    if (action === 'reserve') rows.set(args.reservationId, {id: args.reservationId, user_id: account, device_id: args.deviceId, run_id: args.runId, reserved_ms: args.milliseconds, consumed_ms: 0, lease_until: new Date(start + 10000).toISOString(), settled_at: null});
    const row = rows.get(args.reservationId);
    if (!row) throw Error('Unknown time reservation');
    if (action !== 'reserve') row.consumed_ms = args.consumedMs;
    if (action === 'settle') row.settled_at = new Date(start).toISOString();
    clock += requestDelay;
    return {reservation: {...row}, wallet: {serverNow: new Date(start).toISOString(), availableMs: 30000 - row.consumed_ms, pending: []}, authorizationValid: true};
  };
  const session = new AssistanceSession({storage, api, account: () => account, deviceId: device, now: () => clock, onStop: reason => stops.push(reason)});
  return {session, storage, values, calls, rows, stops, api, time: value => clock = value, login: value => account = value, fail: value => failure = value, delay: value => requestDelay = value};
}

test('COM-03: 60/120/480 ticks per real second debit the same integer milliseconds', async () => {
  for (const hz of [60, 120, 480]) {
    const f = fixture(); await f.session.start(run, 30000);
    for (let i = 0; i < hz * 5; i++) f.session.consume(1000 / hz, true);
    near(f.session.journal.usedMs + f.session.journal.fraction, 5000);
    near(f.session.remainingMs(), 25000); f.session.stop('manual', false); await f.session.flush();
    assert.equal(f.calls.at(-1).args.consumedMs, 5000);
  }
});

test('fractional carry survives checkpoints; arithmetic path does no storage/network I/O', async () => {
  const f = fixture(); await f.session.start(run, 30000);
  const initialWrites = [...f.values.values()], requests = f.calls.length;
  f.session.consume(1000 / 120, true); assert.equal(f.session.journal.usedMs, 8);
  assert.deepEqual([...f.values.values()], initialWrites); assert.equal(f.calls.length, requests);
  await f.session.flush(); const persisted = f.session.read(); near(persisted.fraction, 1 / 3);
  f.session.consume(1000 / 120, true); f.session.consume(1000 / 120, true);
  assert.equal(f.session.journal.usedMs, 25); near(f.session.journal.fraction, 0);
  f.session.stop('manual', false); await f.session.flush();
});

test('paused/ineligible ticks and post-takeover ticks cannot consume time', async () => {
  const f = fixture(); await f.session.start(run, 15000);
  assert.equal(f.session.consume(1000, false), 0); near(f.session.remainingMs(), 15000);
  f.session.consume(1234.5, true); f.session.stop('manual', false);
  assert.equal(f.session.consume(1000, true), 0); assert.deepEqual(f.stops, ['manual']);
  await f.session.flush(); assert.equal(f.calls.at(-1).args.consumedMs, 1234);
  // Final fractional rounding is less than 1ms; checkpoint fractions are not
  // dropped every tick or every checkpoint. No full-activation charge occurs.
});

test('a small purchased remainder ends exactly at its authorized boundary', async () => {
  const f = fixture(); await f.session.start(run, 5);
  assert.equal(f.session.consume(1000 / 120, true), 5); assert.equal(f.session.active, false);
  assert.deepEqual(f.stops, ['expired']); assert.equal(f.session.consume(1000 / 120, true), 0);
  await f.session.flush(); assert.equal(f.calls.at(-1).args.consumedMs, 5);
});

test('INT-12/17: expiry truncates the final actual-engine tick and halts catch-up at every playback/render rate', async () => {
  for(const rate of [1,2,4])for(const hz of [30,60,144]){
    const f=fixture();let paused=false;f.session.onStop=()=>paused=true;
    await f.session.start(run,1001);
    const game=new Game();game.grid.clear();game.remaining=1;game.status='playing';
    game.balls=[{x:160,y:480,r:2.35,vx:180,vy:-200}];
    const input=new PaddleInput();input.startAuto(game.paddle);
    const clock=new FixedSimulation();clock.reset(0);
    for(let n=1;n<=hz*2;n++)clock.frame(n*1000/hz,(dt,at)=>{
      if(paused)return false;
      input.applyThrough(at,game.paddle);game.target=input.desired(dt,game.paddle,()=>game.autoTarget());
      const allowed=f.session.consume(dt*1000/rate,true);
      if(!allowed)return false;
      game.step(allowed*rate/1000);
    },rate);
    near(game.time,1.001*rate);assert.equal(f.session.journal.usedMs,1001);assert.equal(f.session.active,false);
    await f.session.flush();assert.equal(f.calls.at(-1).args.consumedMs,1001);
  }
});

test('server lease uses monotonic time and subtracts network delay', async () => {
  const f = fixture(); f.delay(500); await f.session.start(run, 30000);
  near(f.session.deadline, 9950);
  f.time(9950); assert.equal(f.session.consume(8, true), 0); assert.equal(f.session.active, false);
  assert.deepEqual(f.stops, ['authorization']); await f.session.flush();
});

test('late authorization returns all unused time without ever starting AI', async () => {
  const f = fixture(); f.delay(11000);
  await assert.rejects(() => f.session.start(run, 30000), /too late/);
  assert.equal(f.session.active, false); assert.equal(f.calls.at(-1).action, 'settle'); assert.equal(f.calls.at(-1).args.consumedMs, 0);
});

test('uncertain start and checkpoint failures retain a durable recovery identity', async () => {
  const f = fixture(); f.fail(Error('offline'));
  await assert.rejects(() => f.session.start(run, 15000), /offline/);
  assert.equal(f.session.active, false); assert.equal(f.session.read().status, 'requesting');
  const g = fixture(); await g.session.start(run, 15000); g.session.consume(1500.25, true); g.fail(Error('offline'));
  await assert.rejects(() => g.session.flush(), /offline/); assert.equal(g.session.active, false);
  assert.equal(g.session.read().usedMs, 1500); near(g.session.read().fraction, .25);
  g.fail(null); await g.session.recoverLocal(); assert.equal(g.session.active, false); assert.equal(g.session.read(), null);
});

test('restart recovers consumption but never restores active automation from its journal', async () => {
  const f = fixture(); await f.session.start(run, 30000); f.session.consume(4321.75, true); await f.session.flush();
  const restarted = new AssistanceSession({storage: f.storage, api: f.api, account: () => owner, deviceId: device, now: () => 0});
  assert.equal(restarted.active, false); assert.equal(restarted.consume(500, true), 0);
  await restarted.recoverLocal(); assert.equal(restarted.active, false); assert.equal(restarted.read(), null);
  assert.equal(f.calls.at(-1).args.consumedMs, 4321);
});

test('storage failure prevents starting a server reservation', async () => {
  const f = fixture(); f.storage.setItem = () => { throw Error('storage failed'); };
  await assert.rejects(() => f.session.start(run, 15000), /storage failed/); assert.equal(f.calls.length, 0);
});

test('corrupt local journals are cleared only after authoritative absence of pending time',async()=>{
 const f=fixture();f.values.set(f.session.key(owner),'{bad json');
 await f.session.recoverLocal();assert.equal(f.session.read(),null);assert.equal(f.session.active,false);
 const g=fixture();await g.session.start(run,15000);g.session.stop('manual',false);
 g.values.set(g.session.key(owner),'{bad json');
 await assert.rejects(()=>g.session.recoverLocal(),/needs recovery/);
 assert(g.session.wallet.pending.length);assert.equal(g.values.get(g.session.key(owner)),'{bad json');
});

test('cancelling while authorization is in flight cannot start assistance afterward', async () => {
  const f = fixture(); let resolve;
  const session = new AssistanceSession({storage: f.storage, account: () => owner, deviceId: device, now: () => 0, api: async (action, args) => {
    const response = await f.api(action, args);
    if (action === 'reserve') await new Promise(done => resolve = done);
    return response;
  }});
  const pending = session.start(run, 15000); await new Promise(done => setImmediate(done));
  session.stop('background'); resolve(); await assert.rejects(() => pending, /cancelled/);
  assert.equal(session.active, false); assert.equal(f.calls.at(-1).action, 'settle'); assert.equal(f.calls.at(-1).args.consumedMs, 0);
});

test('a signed-out or changed identity cannot activate or settle another account’s bank', async () => {
  const f = fixture(); f.login(null); await assert.rejects(() => f.session.start(run, 15000), /Sign in/); assert.equal(f.calls.length, 0);
  f.login(owner); await f.session.start(run, 15000); f.session.consume(1000, true); f.login('44444444-4444-4444-8444-444444444444');
  await assert.rejects(() => f.session.flush(), /Sign back in/); assert.equal(f.session.active, false);
  assert.equal(f.calls.length, 1); assert(f.values.has(f.session.key(owner)));
});
