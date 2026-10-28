import test from 'node:test';
import assert from 'node:assert/strict';
import {PaddleInput, FixedSimulation} from '../dist/controls.js';
import {Game} from '../dist/engine.js';
import {fitViewport} from '../dist/viewport.js';
const near = (a, b, eps = 1e-7) => assert(Math.abs(a - b) <= eps, `${a} != ${b}`);
const paddle = () => ({x: 200, y: 584, w: 82});
const apply = (input, p, at, dt = 1 / 120) => { input.applyThrough(at, p); p.x = input.desired(dt, p, () => 100); };
test('fast swipe reversal and release stop a lagging real paddle immediately',()=>{
 const g=new Game(),i=new PaddleInput();g.launch();const step=at=>{i.applyThrough(at,g.paddle);g.target=i.desired(1/120,g.paddle,()=>200);g.step(1/120);};
 i.touchStart(1,100,0);step(0);const initial=g.paddle.x;
 i.touchMove(1,300,1,10);step(10);const right=g.paddle.x;assert(right>initial&&i.target>right+50);
 i.touchMove(1,298,1,20);step(20);const reversed=g.paddle.x;assert(reversed<right,'fresh left input must move the physical paddle left');
 i.touchEnd(1,30);step(30);const released=g.paddle.x;step(40);assert.equal(g.paddle.x,released,'no stored target may move after release');
});

test('ready touch places the paddle and keeps that position after release',()=>{
 const input=new PaddleInput(),p={x:208,y:584,w:112};
 input.touchStart(1,300,0);input.place(300,0);input.touchEnd(1,1,true);apply(input,p,1);
 near(p.x,300);assert.equal(input.owner,'none');
 input.touchStart(2,310,2);input.place(310,2);input.touchMove(2,330,1,3);input.touchEnd(2,4,true);apply(input,p,4);
 near(p.x,350);
});

test('CTL-02..06: relative touch pickup, vertical, clutch, edges and one pointer', () => {
  const i = new PaddleInput(), p = paddle();
  assert(i.touchStart(1, 5, 0)); apply(i, p, 0); near(p.x, 200);
  i.touchMove(1, 5, 1, 1); apply(i, p, 1); near(p.x, 200);
  assert.equal(i.touchStart(2, 300, 2), false);
  assert.equal(i.touchMove(2, 400, 1, 3), false); apply(i, p, 3); near(p.x, 200);
  i.touchMove(1, 500, 1, 4); apply(i, p, 4); near(p.x, 373);
  i.touchMove(1, 499, 1, 5); apply(i, p, 5); near(p.x, 371);
  i.touchMove(1, -500, 1, 6); apply(i, p, 6); near(p.x, 43);
  i.touchMove(1, -499, 1, 7); apply(i, p, 7); near(p.x, 45);
  assert.equal(i.touchEnd(2, 8), false); i.touchEnd(1, 9); apply(i, p, 9);
  i.touchStart(3, 350, 10); apply(i, p, 10); near(p.x, 45);
  i.touchMove(3, 360, 1, 11); apply(i, p, 11); near(p.x, 65);
});

test('CTL-12/17: pointer seeds on entry and rejects idle oscillation before takeover', () => {
  const i = new PaddleInput(), p = paddle(); i.startAuto(p);
  i.pointerMove(100, 1, 1); i.pointerMove(101, 1, 2); i.pointerMove(100, 1, 3);
  i.applyThrough(3, p); assert.equal(i.owner, 'auto');
  i.pointerMove(104, 1, 4); apply(i, p, 4); assert.equal(i.owner, 'pointer'); near(p.x, 204);
  i.pointerMove(105, 1, 5); apply(i, p, 5); near(p.x, 205); // no repeated threshold
  i.pointerLeave(); i.pointerMove(900, 1, 6); apply(i, p, 6); near(p.x, 205);
});

test('CTL-13/14: key repeat is immaterial; both directions neutral and release resolves', () => {
  function trace(repeats) {
    const i = new PaddleInput(), p = paddle(); i.keyDown('ArrowRight', false, 0);
    for (let t = 0; t < 20; t++) {
      if (repeats) i.keyDown('ArrowRight', true, t * 1000 / 120);
      apply(i, p, t * 1000 / 120);
    }
    return p.x;
  }
  near(trace(false), trace(true));
  const i = new PaddleInput(), p = paddle();
  i.keyDown('ArrowLeft', false, 0); i.keyDown('ArrowRight', false, 0); apply(i, p, 0); near(p.x, 200);
  i.keyUp('ArrowLeft', 1); apply(i, p, 1); assert(p.x > 200);
  const x = p.x; i.keyUp('ArrowRight', 2); apply(i, p, 2); near(p.x, x);
});

test('CTL-17: fresh claims anchor actual paddle and old key releases cannot steal', () => {
  let manual = 0; const i = new PaddleInput({onManual: () => manual++}), p = paddle();
  i.keyDown('ArrowLeft', false, 0); apply(i, p, 0);
  i.startAuto(p); p.x = 300; i.touchStart(1, 20, 1); apply(i, p, 1); near(p.x, 300);
  assert.equal(manual, 1); assert.equal(i.owner, 'touch');
  i.keyUp('ArrowLeft', 2); i.touchMove(1, 30, 1, 2); apply(i, p, 2);
  assert.equal(i.owner, 'touch'); near(p.x, 320);
  i.keyDown('ArrowRight', false, 3); apply(i, p, 3); assert.equal(i.owner, 'keyboard');
});

test('CTL-09/15: reset discards held keys, captured identities, baselines and queued deltas', () => {
  const i = new PaddleInput(), p = paddle();
  i.keyDown('ArrowLeft', false, 0); i.touchStart(1, 10, 0); i.touchMove(1, 200, 1, 1);
  i.reset(); apply(i, p, 10); near(p.x, 200); assert.equal(i.touchId, null);
  i.pointerMove(999, 1, 11); apply(i, p, 11); near(p.x, 200);
});

test('CTL-19: letterboxing/CSS scale converts movement once, independently of DPR', () => {
  for (const ratio of [1, 1.5, 2, 3]) for (const size of [[390, 600], [800, 480], [320, 500]]) {
    const view = fitViewport(...size, ratio), i = new PaddleInput(), p = paddle();
    i.touchStart(1, 100, 0); i.touchMove(1, 100 + 20 * view.scale, view.scale, 1);
    apply(i, p, 1); near(p.x, 240);
    p.w = 118; i.touchMove(1, 10000, view.scale, 2); apply(i, p, 2); near(p.x, 355);
  }
});

function replay(frameTimes) {
  const g = new Game(); g.grid.clear(); g.remaining = 2; g.status = 'playing';
  g.balls = [{x: 160, y: 480, r: 2.35, vx: 180, vy: -200}];
  const i = new PaddleInput(), clock = new FixedSimulation(); clock.reset(0);
  for (const [at, kind, data] of [
    [20, 'claim', {owner: 'touch'}], [50, 'delta', {owner: 'touch', dx: 500}],
    [150, 'delta', {owner: 'touch', dx: -10}], [250, 'delta', {owner: 'touch', dx: -600}],
    [300, 'delta', {owner: 'touch', dx: 12}], [350, 'key', {key: 'ArrowRight', down: true}],
    [500, 'key', {key: 'ArrowLeft', down: true}], [550, 'key', {key: 'ArrowRight', down: false}],
    [650, 'key', {key: 'ArrowLeft', down: false}],
  ]) i.enqueue(at, kind, data);
  let ticks = 0;
  for (const at of frameTimes) clock.frame(at, (dt, time) => {
    i.applyThrough(time, g.paddle); g.target = i.desired(dt, g.paddle, () => 200); g.step(dt); ticks++;
  });
  return {paddle: g.paddle.x, balls: g.balls, score: g.score, lives: g.lives, ticks, time: g.time};
}

test('CTL-18/PHY-22: actual engine timestamped replay agrees across render delivery', () => {
  const traces = [30, 60, 90, 120, 144].map(hz => Array.from({length: hz}, (_, n) => (n + 1) * 1000 / hz));
  const irregular = []; let t = 0;
  while (t < 1000) { t = Math.min(1000, t + [7, 19, 31, 11, 8][irregular.length % 5]); irregular.push(t); }
  traces.push(irregular); const baseline = replay(traces[0]);
  for (const trace of traces.slice(1)) {
    const value = replay(trace); assert.equal(value.ticks, 120);
    near(value.paddle, baseline.paddle); near(value.time, baseline.time);
    assert.deepEqual(value.balls, baseline.balls); assert.equal(value.score, baseline.score); assert.equal(value.lives, baseline.lives);
  }
});

test('PHY-23/CTL-20: suspended debt is discarded and frame stalls have bounded work', () => {
  const clock = new FixedSimulation(); let active = 0; clock.reset(0);
  clock.frame(1000, dt => active += dt); near(active, .1);
  clock.reset(90000); clock.frame(90000, dt => active += dt); near(active, .1);
  const count = clock.frame(90100, dt => active += dt, 4); assert.equal(count, 48); near(active, .5);
});
