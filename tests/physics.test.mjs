import test from 'node:test';
import assert from 'node:assert/strict';
import {Game, W, H} from '../dist/engine.js';
import {reflect, reflectManifold, steer, penetration, sweepCircleRect, sweepPaddle, advanceCircle, MAX_CONTACTS} from '../dist/physics.js';

const near = (actual, expected, tolerance = 1e-7) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const brick = (id, x, y, w = 8, h = 8, hp = 1) => ({id, x, y, w, h, type: 'brick', hp});
function emptyGame() {
  const g = new Game(); g.grid.clear(); g.remaining = 2; g.status = 'playing';
  return g;
}
function arena(cells = [], extra = {}) {
  const map = new Map(cells.map(cell => [cell.id, cell]));
  const hits = [], traces = [];
  return {map, hits, traces, colliders: () => map.values(), impact: cell => {hits.push(cell.id); if (--cell.hp === 0) map.delete(cell.id);}, trace: event => traces.push(event), ...extra};
}

test('PHY-01..08: approaching reflection, tangent, separating and invalid normals', () => {
  for (const [vx, vy, nx, ny, x, y] of [
    [3, 4, 0, -1, 3, -4], [3, 4, -1, 0, -3, 4], [3, -4, 0, 1, 3, 4],
    [3, 4, -1, -1, -4, -3], [-3, 4, -1, 0, -3, 4], [3, 0, 0, -1, 3, 0],
    [3, 4, -9, 0, -3, 4], [3, 4, 0, 0, 3, 4], [3, 4, NaN, 1, 3, 4],
  ]) {
    const v = reflect(vx, vy, nx, ny); near(v.vx, x); near(v.vy, y); near(Math.hypot(v.vx, v.vy), Math.hypot(vx, vy));
  }
  for (let i = 0; i < 1000; i++) {
    const angle = i * 2.399963229728653, nx = Math.cos(angle), ny = Math.sin(angle);
    const tangent = Math.sin(i * .7) * 300, approach = -1 - i % 431;
    const vx = nx * approach - ny * tangent, vy = ny * approach + nx * tangent;
    const v = reflect(vx, vy, nx * 17, ny * 17);
    near(v.vx * nx + v.vy * ny, -approach);
    near(-v.vx * ny + v.vy * nx, tangent);
    near(Math.hypot(v.vx, v.vy), Math.hypot(vx, vy));
  }
});

test('regression: free vertical and shallow flight no longer changes velocity', () => {
  for (const [vx, vy] of [[0, -300], [300, 0], [2, -300], [300, 2]]) {
    const g = emptyGame(), b = {x: 200, y: 470, r: 2.35, vx, vy}; g.balls = [b];
    g.step(1 / 120); near(b.vx, vx); near(b.vy, vy); near(b.x, 200 + vx / 120); near(b.y, 470 + vy / 120);
  }
});

test('PHY-09/10: expanded corner squares are not a circle/rectangle hit', () => {
  const rect = {x: 0, y: 0, w: 10, h: 10};
  assert.equal(penetration({x: -.9, y: -.9, r: 1}, rect), null);
  // Cross the expanded top-left square along x+y=-1.8: never reach its arc.
  assert.equal(sweepCircleRect({x: -1.1, y: -.7, r: 1, vx: .4, vy: -.4}, rect, 1), null);
});

test('PHY-04: true rounded corner has a radial normal and exact impact time', () => {
  const b = {x: -2, y: -2, r: 1, vx: 1, vy: 1};
  const hit = sweepCircleRect(b, {x: 0, y: 0, w: 10, h: 10}, 2);
  near(hit.t, 2 - 1 / Math.sqrt(2)); near(hit.nx, -1 / Math.sqrt(2)); near(hit.ny, hit.nx);
});

test('PHY-11/12: fast circle uses first TOI and all residual motion', () => {
  const world = arena([brick(1, 100, 0, 8, 100)]), b = {x: 80, y: 50, vx: 6000, vy: 0, r: 5};
  const result = advanceCircle(b, 1 / 60, world);
  near(world.traces[0].elapsed, .0025); near(world.traces[0].x, 95);
  near(b.x, 10); near(b.y, 50); near(b.vx, -6000); near(result.elapsed, 1 / 60);
  assert.deepEqual(world.hits, [1]); assert.equal(result.exhausted, false);
});

test('PHY-11: actual engine grid broad phase handles maximum speed and thin targets', () => {
  const g = emptyGame(), c = brick(30 * 52 + 20, 160, 258);
  g.grid.set(c.id, c); g.balls = [{x: 150, y: 262, r: 2.35, vx: 431, vy: 0}];
  g.step(1 / 30); assert.equal(g.remaining, 1); near(g.balls[0].vx, -431);
  assert(g.balls[0].x < 157.65); assert.equal(g.score, 10);
});

test('PHY-13: moving capsule catches a ball crossed during travel, not at final pose', () => {
  const b = {x: 100, y: 570, r: 2.35, vx: 0, vy: 300};
  const world = arena([], {speed: 300, paddle: {x: 60, y: 584, w: 82, vx: 1500, movingUntil: .03}});
  advanceCircle(b, .05, world); assert(b.vy < 0);
  assert(world.traces.some(event => event.category === 'paddle-steering'));
  const miss = {x: 100, y: 570, r: 2.35, vx: 0, vy: 300};
  advanceCircle(miss, .05, arena([], {speed: 300, paddle: {x: 300, y: 584, w: 82, vx: -1500, movingUntil: .03}}));
  near(miss.vy, 300); // The distant path did not intersect the ball.
});

test('PHY-14/15: mirrored top aiming and exact centre under the 60 degree law', () => {
  for (const offset of [-.5, 0, .5]) {
    const v = steer(offset, 10); near(v.vx, offset * 10); near(v.vy, offset === 0 ? -10 : -Math.sqrt(75));
    const b = {x: 200 + offset * 41, y: 570, vx: 0, vy: 300, r: 2.35};
    advanceCircle(b, .05, arena([], {speed: 300, paddle: {x: 200, y: 584, w: 82, vx: 0, movingUntil: 0}}));
    const expected = steer(offset, 300); near(b.vx, expected.vx); near(b.vy, expected.vy);
  }
  const b = {x: 200, y: 570, vx: 0, vy: 300, r: 2.35};
  const impactTime = (584 - 2.35 - 570) / 300;
  const offset = (200 - (180 + 300 * impactTime)) / 41;
  advanceCircle(b, .05, arena([], {speed: 300, paddle: {x: 180, y: 584, w: 82, vx: 300, movingUntil: .1}}));
  near(b.vx, 300 * Math.sin(offset * Math.PI / 3)); near(b.vy, -300 * Math.cos(offset * Math.PI / 3));
});

test('PHY-16: upper rounded caps are geometric; underside and lost balls pass through', () => {
  const paddle = {x: 200, y: 584, w: 82, vx: 0};
  const cap = sweepPaddle({x: 158, y: 580, vx: 100, vy: 300, r: 2.35}, paddle, .05);
  assert(cap); assert.equal(cap.face, 'corner'); assert(cap.nx < 0 && cap.ny < 0);
  assert.equal(sweepPaddle({x: 200, y: 600, vx: 0, vy: -300, r: 2.35}, paddle, .1), null);
  assert.equal(sweepPaddle({x: 200, y: 600, vx: 0, vy: 300, r: 2.35}, paddle, .1), null);
  assert.equal(sweepPaddle({x: 150, y: 587.5, vx: 300, vy: .001, r: 2.35}, paddle, .1), null);
});

test('PHY-17: simultaneous orthogonal arena contacts reflect once per constraint', () => {
  const b = {x: 5, y: 5, r: 1, vx: -100, vy: -100};
  advanceCircle(b, .1, arena([], {bounds: {width: 100}}));
  near(b.x, 7); near(b.y, 7); near(b.vx, 100); near(b.vy, 100);
});

test('PHY-18: seam order cannot change velocity, damage or score', () => {
  const outcomes = [];
  for (const reverse of [false, true]) {
    const cells = [brick(1, 0, 100), brick(2, 8, 100)]; if (reverse) cells.reverse();
    const world = arena(cells), b = {x: 8, y: 90, r: 2.35, vx: 0, vy: 300};
    advanceCircle(b, .05, world);
    outcomes.push({...b, hits: [...world.hits]});
    assert.deepEqual(world.hits, [1, 2]); near(b.vy, -300);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
  const normals = [{nx: -1, ny: 0}, {nx: 0, ny: -1}];
  assert.deepEqual(reflectManifold(3, 4, normals), reflectManifold(3, 4, normals.reverse()));
});

test('PHY-19: initial penetration is recovered without points or extra damage', () => {
  const g = emptyGame(), c = brick(30 * 52 + 20, 160, 258);
  g.grid.set(c.id, c); g.balls = [{x: 164, y: 262, r: 2.35, vx: 100, vy: 100}];
  g.step(1 / 120); assert.equal(g.remaining, 2); assert.equal(c.hp, 1); assert.equal(g.score, 0);
  assert(Number.isFinite(g.balls[0].x + g.balls[0].y));
  const world = arena([brick(1, 100, 100)]), b = {x: 98, y: 104, r: 2.35, vx: -300, vy: 0};
  advanceCircle(b, .01, world); near(b.vx, -300); assert.deepEqual(world.hits, []);
});

test('PHY-20/21: new distinct impacts count, destroyed colliders leave before residual sweeps', () => {
  const c = brick(1, 100, 100, 8, 8, 2), world = arena([c]);
  for (let i = 0; i < 2; i++) advanceCircle({x: 90, y: 104, r: 2, vx: 300, vy: 0}, .05, world);
  assert.deepEqual(world.hits, [1, 1]); assert.equal(world.map.size, 0);
  const b = {x: 90, y: 104, r: 2, vx: 300, vy: 0}; advanceCircle(b, .1, world);
  near(b.x, 120); near(b.vx, 300); assert.equal(world.hits.length, 2);
  const corridor = arena([brick(1, 0, 100, 8, 8, 2), brick(2, 20, 100, 8, 8, 2)]);
  advanceCircle({x: 14, y: 104, r: 2, vx: 300, vy: 0}, .1, corridor);
  assert.deepEqual(corridor.hits, [2, 1, 2, 1]); assert.equal(corridor.map.size, 0);
  const pierced = arena([brick(1, 100, 100)], {bounds: {width: 140}, pierce: () => true});
  const returning = {x: 90, y: 104, r: 2, vx: 600, vy: 0};
  advanceCircle(returning, .2, pierced); near(returning.x, 66); near(returning.vx, -600); assert.deepEqual(pierced.hits, [1]);
});

test('fireballs pierce coloured bricks while gray walls reflect in the same step', () => {
  const wall = {...brick(2, 120, 100), type: 'wall', hp: Infinity};
  const world = arena([brick(1, 100, 100), wall], {pierce: cell => cell.type === 'brick'});
  const b = {x: 90, y: 104, r: 2, vx: 600, vy: 0};
  advanceCircle(b, .1, world); near(b.x, 86); near(b.vx, -600); assert(world.map.has(2));
});

test('PHY-24: long static rebounds preserve speed without random angle changes', () => {
  const b = {x: 50, y: 50, r: 2.35, vx: 300, vy: 170};
  const world = arena([], {bounds: {width: 100, floor: 100}});
  for (let i = 0; i < 120 * 100; i++) advanceCircle(b, 1 / 120, world);
  near(Math.hypot(b.vx, b.vy), Math.hypot(300, 170));
  near(Math.abs(b.vx), 300); near(Math.abs(b.vy), 170);
});

test('PHY-25: contact exhaustion is bounded and never advances through remaining geometry', () => {
  const b = {x: 2, y: 50, r: 1, vx: 1e9, vy: 0};
  const world = arena([], {bounds: {width: 5}}), result = advanceCircle(b, 1 / 60, world);
  assert.equal(result.iterations, MAX_CONTACTS); assert.equal(result.exhausted, true);
  assert(b.x >= 1 && b.x <= 4); assert(world.traces.some(event => event.category === 'iteration-limit'));
});

test('non-finite or suspended simulation steps cannot corrupt game state', () => {
  const g = emptyGame(); g.balls = [{x: W / 2, y: H / 2, vx: 300, vy: 100, r: 2.35}];
  const state = JSON.stringify(g.balls);
  for (const dt of [NaN, Infinity, -1, 0]) g.step(dt);
  assert.equal(JSON.stringify(g.balls), state); assert.equal(g.time, 0);
});
