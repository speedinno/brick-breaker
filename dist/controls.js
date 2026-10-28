export const CONTROL_DEFAULTS = Object.freeze({touchGain: 2, pointerGain: 1, keyTravelSeconds: .65, takeoverPixels: 3});
export const clampGain = value => Math.max(.5, Math.min(4, Number(value) || 1));

// One owner, one simulation-consumed target. DOM events enqueue intent; they do
// not move either the visible paddle or its collider outside the physics step.
export class PaddleInput {
  constructor({width = 416, touchGain = 2, pointerGain = 1, onManual = () => {}} = {}) {
    this.width = width; this.touchGain = clampGain(touchGain); this.pointerGain = clampGain(pointerGain);
    this.onManual = onManual; this.reset();
  }
  reset() {
    this.owner = 'none'; this.target = null; this.keys = new Set();
    this.events = []; this.head = 0; this.touchId = null; this.touchX = null;
    this.pointerX = null; this.pointerMotion = 0; this.pointerClaimed = false;
  }
  enqueue(at, kind, data = {}) { this.events.push({at, kind, ...data}); }
  touchStart(id, x, at) {
    if (this.touchId !== null) return false;
    this.touchId = id; this.touchX = x; this.pointerLeave();
    this.enqueue(at, 'claim', {owner: 'touch'}); return true;
  }
  touchMove(id, x, scale, at) {
    if (id !== this.touchId || !(scale > 0)) return false;
    const dx = (x - this.touchX) / scale * this.touchGain; this.touchX = x;
    this.enqueue(at, 'delta', {owner: 'touch', dx}); return true;
  }
  touchEnd(id, at, retain = false) {
    if (id !== this.touchId) return false;
    this.touchId = null; this.touchX = null; this.enqueue(at, 'end', {owner: 'touch', retain}); return true;
  }
  place(x, at) { this.enqueue(at, 'place', {x}); }
  pointerLeave() { this.pointerX = null; this.pointerMotion = 0; this.pointerClaimed = false; }
  pointerMove(x, scale, at) {
    if (this.touchId !== null || !(scale > 0)) return;
    if (this.pointerX === null) { this.pointerX = x; return; }
    const dx = x - this.pointerX; this.pointerX = x;
    if (!this.pointerClaimed) {
      this.pointerMotion += dx;
      if (Math.abs(this.pointerMotion) < CONTROL_DEFAULTS.takeoverPixels) return;
      this.enqueue(at, 'claim', {owner: 'pointer'}); this.pointerClaimed = true;
      this.enqueue(at, 'delta', {owner: 'pointer', dx: this.pointerMotion / scale * this.pointerGain});
      this.pointerMotion = 0;
    } else this.enqueue(at, 'delta', {owner: 'pointer', dx: dx / scale * this.pointerGain});
  }
  keyDown(key, repeat, at) {
    if (!['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(key)) return false;
    if (!repeat) { this.pointerLeave(); this.enqueue(at, 'key', {key, down: true}); }
    return true;
  }
  keyUp(key, at) { if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(key)) this.enqueue(at, 'key', {key, down: false}); }
  startAuto(paddle) { this.reset(); this.owner = 'auto'; this.target = paddle.x; }
  takeControl(paddle) { this.reset(); this.owner = 'none'; this.target = paddle.x; this.onManual(); }
  applyThrough(at, paddle) {
    const min = paddle.w / 2 + 2, max = this.width - min;
    const clamp = x => Math.max(min, Math.min(max, x));
    if (this.target === null) this.target = paddle.x;
    while (this.head < this.events.length && this.events[this.head].at <= at + 1e-7) {
      const e = this.events[this.head++];
      if (e.kind === 'claim' || e.kind === 'key' && e.down) {
        if (this.owner === 'auto') this.onManual();
        this.owner = e.kind === 'key' ? 'keyboard' : e.owner;
        this.target = paddle.x;
      }
      if (e.kind === 'delta' && this.owner === e.owner) {
        // Drop unfulfilled travel when the player reverses before the physical
        // paddle catches up. The engine still moves the collider at its limit.
        if (e.dx * (this.target - paddle.x) < 0) this.target = paddle.x;
        this.target = clamp(this.target + e.dx);
      }
      if (e.kind === 'place') this.target = clamp(e.x);
      if (e.kind === 'key') {
        if (e.down) this.keys.add(e.key);
        else { this.keys.delete(e.key); if (!this.keys.size && this.owner === 'keyboard') this.target = paddle.x; }
      }
      if (e.kind === 'end' && this.owner === e.owner) { this.owner = 'none'; if(!e.retain)this.target = paddle.x; }
    }
    if (this.head === this.events.length) { this.events.length = 0; this.head = 0; }
    // A widening power-up changes the legal centre range immediately.
    this.target = clamp(this.target);
  }
  desired(dt, paddle, autoTarget) {
    const min = paddle.w / 2 + 2, max = this.width - min;
    if (this.owner === 'auto') this.target = autoTarget();
    else if (this.owner === 'keyboard') {
      const left = this.keys.has('ArrowLeft') || this.keys.has('a');
      const right = this.keys.has('ArrowRight') || this.keys.has('d');
      const direction = Number(right) - Number(left);
      this.target += direction * (max - min) / CONTROL_DEFAULTS.keyTravelSeconds * dt;
    }
    this.target = Math.max(min, Math.min(max, this.target ?? paddle.x));
    return this.target;
  }
}

// Input is sampled at fixed wall-time boundaries. Playback rate changes the
// number of identical physics ticks, not the distance of a pointer delta.
// Stalls retain at most 100 ms / 48 ticks; suspended time is discarded by reset.
export class FixedSimulation {
  constructor({step = 1 / 120, maxFrameMs = 100, maxSteps = 48} = {}) {
    this.step = step; this.maxFrameMs = maxFrameMs; this.maxSteps = maxSteps; this.reset();
  }
  reset(at = null) { this.last = at; this.cursor = at; this.pending = 0; }
  frame(at, update, rate = 1) {
    if (this.last === null) { this.reset(at); return 0; }
    const elapsed = Math.max(0, at - this.last), accepted = Math.min(this.maxFrameMs, elapsed);
    this.last = at;
    if (elapsed > this.maxFrameMs) this.cursor += elapsed - accepted;
    this.pending += accepted;
    const tickMs = this.step * 1000 / rate;
    let steps = 0;
    while (this.pending + 1e-8 >= tickMs && steps < this.maxSteps) {
      this.cursor += tickMs; this.pending = Math.max(0, this.pending - tickMs);
      const proceed = update(this.step, this.cursor); steps++;
      if(proceed===false){this.cursor+=this.pending;this.pending=0;break;}
    }
    if (steps === this.maxSteps && this.pending >= tickMs) {
      this.cursor += this.pending; this.pending = 0;
    }
    return steps;
  }
}
