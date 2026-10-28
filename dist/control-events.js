// DOM routing is separate from simulation intent. The noninteractive HUD and
// court share the same input surface; real UI owns gestures begun on its nodes.
const INTERACTIVE = 'button,a,input,select,textarea,label,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="switch"],dialog';
export const isInteractive = target => Boolean(target?.closest?.(INTERACTIVE));

export function bindPaddleEvents({surface, focusTarget, input, enabled, scale, ready = () => false, position = () => 0, now = () => performance.now()}) {
  const suppressedClicks = new Set();
  const on = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  const listeners = [], doc = surface.ownerDocument;
  function release(id) {
    try { if (surface.hasPointerCapture?.(id)) surface.releasePointerCapture(id); } catch {}
  }
  function cancel() {
    const id = input.touchId;
    input.reset();
    if (id !== null) release(id);
  }
  on(surface, 'pointerdown', e => {
    suppressedClicks.delete(e.pointerId);
    if (!enabled() || isInteractive(e.target)) return;
    if (e.pointerType === 'mouse') {
      if (ready()) { input.place(position(e.clientX), now()); focusTarget.focus({preventScroll: true}); }
      return; // ordinary button-free hover path
    }
    if (!input.touchStart(e.pointerId, e.clientX, now())) return;
    if (ready()) input.place(position(e.clientX), now());
    suppressedClicks.add(e.pointerId);
    if (suppressedClicks.size > 32) suppressedClicks.delete(suppressedClicks.values().next().value);
    e.preventDefault();
    focusTarget.focus({preventScroll: true});
    try { surface.setPointerCapture(e.pointerId); } catch {} // cancellation can race capture
  }, {capture: true, passive: false});
  on(surface, 'pointermove', e => {
    if (!enabled()) return;
    if (input.touchId === e.pointerId) {
      input.touchMove(e.pointerId, e.clientX, scale(), now()); e.preventDefault();
    } else if (e.pointerType === 'mouse') {
      if (isInteractive(e.target)) input.pointerLeave();
      else input.pointerMove(e.clientX, scale(), now());
    }
  }, {capture: true, passive: false});
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) on(surface, type, e => {
    if (input.touchEnd(e.pointerId, now(), ready())) { e.preventDefault(); release(e.pointerId); }
  }, {capture: true, passive: false});
  on(surface, 'pointerleave', () => input.pointerLeave());
  // Browsers differ on compatibility click dispatch after pointer capture. A
  // gameplay pointer cannot click a crossed button; a separate UI finger can.
  on(surface, 'click', e => {
    if (suppressedClicks.has(e.pointerId)) {
      suppressedClicks.delete(e.pointerId); e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
  on(doc, 'keydown', e => {
    if (!enabled() || isInteractive(e.target) || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (input.keyDown(key, e.repeat, now())) e.preventDefault();
  });
  on(doc, 'keyup', e => input.keyUp(e.key.length === 1 ? e.key.toLowerCase() : e.key, now()));
  on(surface, 'dragstart', e => { if (!isInteractive(e.target)) e.preventDefault(); });
  return {cancel, destroy() { cancel(); for (const remove of listeners) remove(); }};
}
