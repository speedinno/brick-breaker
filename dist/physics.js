// World units are CSS-independent: x right, y down, seconds for time.
// These small tolerances resolve floating-point contact noise, not missed travel.
export const POSITION_EPS = 1e-7;
export const VELOCITY_EPS = 1e-9;
export const TIME_EPS = 1e-10;
export const MAX_CONTACTS = 16;
export const PADDLE_HEIGHT = 7;
export const PADDLE_ANGLE = Math.PI / 3;

export function reflect(vx, vy, nx, ny) {
  const length = Math.hypot(nx, ny);
  if (!Number.isFinite(length) || length < VELOCITY_EPS) return {vx, vy};
  nx /= length; ny /= length;
  const approach = vx * nx + vy * ny;
  return approach < -VELOCITY_EPS
    ? {vx: vx - 2 * approach * nx, vy: vy - 2 * approach * ny}
    : {vx, vy};
}

export function steer(offset, speed) {
  const angle = Math.max(-1, Math.min(1, offset)) * PADDLE_ANGLE;
  return {vx: speed * Math.sin(angle), vy: -speed * Math.cos(angle)};
}

// Exact circle/rectangle penetration. Ties use left, right, top, bottom.
// Initial overlap is recovery only: it never represents a rewardable impact.
export function penetration(b, rect) {
  const qx = Math.max(rect.x, Math.min(rect.x + rect.w, b.x));
  const qy = Math.max(rect.y, Math.min(rect.y + rect.h, b.y));
  const dx = b.x - qx, dy = b.y - qy, distance = Math.hypot(dx, dy);
  if (distance > POSITION_EPS) {
    return distance < b.r - POSITION_EPS
      ? {nx: dx / distance, ny: dy / distance, depth: b.r - distance} : null;
  }
  const edges = [
    {depth: b.x - rect.x + b.r, nx: -1, ny: 0},
    {depth: rect.x + rect.w - b.x + b.r, nx: 1, ny: 0},
    {depth: b.y - rect.y + b.r, nx: 0, ny: -1},
    {depth: rect.y + rect.h - b.y + b.r, nx: 0, ny: 1},
  ];
  return edges.reduce((a, edge) => edge.depth < a.depth ? edge : a);
}

// Shape cast against four faces and four quarter-circle corner arcs. A padded
// AABB is only a broad phase; its square corners are never treated as solid.
export function sweepCircleRect(b, rect, duration) {
  const overlap = penetration(b, rect);
  if (overlap) return {t: 0, ...overlap, recovery: true};
  let earliest = null;
  function accept(t, nx, ny, face) {
    if (!Number.isFinite(t) || t < -TIME_EPS || t > duration + TIME_EPS) return;
    if (b.vx * nx + b.vy * ny >= -VELOCITY_EPS) return;
    t = Math.max(0, t);
    if (!earliest || t < earliest.t - TIME_EPS) earliest = {t, nx, ny, face};
  }
  if (b.vx > VELOCITY_EPS) {
    const t = (rect.x - b.r - b.x) / b.vx, y = b.y + b.vy * t;
    if (y >= rect.y - POSITION_EPS && y <= rect.y + rect.h + POSITION_EPS) accept(t, -1, 0, 'left');
  } else if (b.vx < -VELOCITY_EPS) {
    const t = (rect.x + rect.w + b.r - b.x) / b.vx, y = b.y + b.vy * t;
    if (y >= rect.y - POSITION_EPS && y <= rect.y + rect.h + POSITION_EPS) accept(t, 1, 0, 'right');
  }
  if (b.vy > VELOCITY_EPS) {
    const t = (rect.y - b.r - b.y) / b.vy, x = b.x + b.vx * t;
    if (x >= rect.x - POSITION_EPS && x <= rect.x + rect.w + POSITION_EPS) accept(t, 0, -1, 'top');
  } else if (b.vy < -VELOCITY_EPS) {
    const t = (rect.y + rect.h + b.r - b.y) / b.vy, x = b.x + b.vx * t;
    if (x >= rect.x - POSITION_EPS && x <= rect.x + rect.w + POSITION_EPS) accept(t, 0, 1, 'bottom');
  }
  const a = b.vx * b.vx + b.vy * b.vy;
  if (a <= VELOCITY_EPS ** 2) return earliest;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = rect.x + (sx === 1 ? rect.w : 0), y = rect.y + (sy === 1 ? rect.h : 0);
    const dx = b.x - x, dy = b.y - y, dot = dx * b.vx + dy * b.vy;
    const c = dx * dx + dy * dy - b.r * b.r, disc = dot * dot - a * c;
    if (disc < 0) continue;
    // Stable smaller quadratic root avoids cancellation at near-zero contact.
    const root = Math.sqrt(disc), denominator = -dot + root;
    const t = denominator > 0 ? c / denominator : (-dot - root) / a;
    const cx = dx + b.vx * t, cy = dy + b.vy * t;
    if (sx * cx < -POSITION_EPS || sy * cy < -POSITION_EPS) continue;
    const length = Math.hypot(cx, cy);
    if (length > VELOCITY_EPS) accept(t, cx / length, cy / length, 'corner');
  }
  return earliest;
}

// The visible paddle is a horizontal capsule. Treat it as a line swept by its
// radius, then expand by the ball radius. Only its upper half is a playing face.
export function sweepPaddle(b, paddle, duration) {
  if (b.vy <= VELOCITY_EPS || b.y > paddle.y + PADDLE_HEIGHT / 2) return null;
  const radius = PADDLE_HEIGHT / 2;
  const relative = {...b, r: b.r + radius, vx: b.vx - paddle.vx};
  const line = {x: paddle.x - paddle.w / 2 + radius, y: paddle.y + radius, w: paddle.w - 2 * radius, h: 0};
  const hit = sweepCircleRect(relative, line, duration);
  if (!hit || hit.ny >= -VELOCITY_EPS) return null;
  return {...hit, paddle: true, ux: paddle.vx};
}

// Independent approaching normals span both dimensions: invert the incoming
// vector once. Parallel face contacts coalesce, so seams cannot double-reflect.
export function reflectManifold(vx, vy, contacts) {
  const normals = [];
  for (const hit of contacts) {
    if (vx * hit.nx + vy * hit.ny >= -VELOCITY_EPS) continue;
    if (!normals.some(n => n.nx * hit.nx + n.ny * hit.ny > 1 - 1e-9)) normals.push(hit);
  }
  if (!normals.length) return {vx, vy};
  const first = normals[0];
  if (normals.some(n => Math.abs(first.nx * n.ny - first.ny * n.nx) > 1e-9)) return {vx: -vx, vy: -vy};
  return reflect(vx, vy, first.nx, first.ny);
}

// Shared by the real engine and analytical fixtures. Colliders are re-queried
// after each impact so destroyed bricks cannot remain as phantom surfaces.
export function advanceCircle(b, dt, world) {
  let elapsed = 0, iterations = 0;
  const ignored = new Set(); // pierced collider identity
  const recovered = new Set();
  while (elapsed < dt - TIME_EPS && iterations < MAX_CONTACTS) {
    const phase = world.paddle?.movingUntil;
    const duration = phase > elapsed + TIME_EPS ? Math.min(dt, phase) - elapsed : dt - elapsed;
    const contacts = [];
    let earliest = duration + TIME_EPS;
    function add(hit, extra) {
      if (!hit || hit.t < -TIME_EPS || hit.t > duration + TIME_EPS) return;
      hit.t = Math.max(0, hit.t);
      if (hit.t < earliest - TIME_EPS) { earliest = hit.t; contacts.length = 0; }
      if (Math.abs(hit.t - earliest) <= TIME_EPS) contacts.push({...hit, ...extra});
    }
    const bounds = world.bounds;
    if (bounds) {
      if (b.x < b.r - POSITION_EPS) add({t: 0, nx: 1, ny: 0, depth: b.r - b.x, recovery: true}, {id: 'left'});
      else if (b.vx < -VELOCITY_EPS) add({t: (b.r - b.x) / b.vx, nx: 1, ny: 0}, {id: 'left'});
      if (b.x > bounds.width - b.r + POSITION_EPS) add({t: 0, nx: -1, ny: 0, depth: b.x - bounds.width + b.r, recovery: true}, {id: 'right'});
      else if (b.vx > VELOCITY_EPS) add({t: (bounds.width - b.r - b.x) / b.vx, nx: -1, ny: 0}, {id: 'right'});
      if (b.y < b.r - POSITION_EPS) add({t: 0, nx: 0, ny: 1, depth: b.r - b.y, recovery: true}, {id: 'ceiling'});
      else if (b.vy < -VELOCITY_EPS) add({t: (b.r - b.y) / b.vy, nx: 0, ny: 1}, {id: 'ceiling'});
      if (Number.isFinite(bounds.floor)) {
        if (b.y > bounds.floor - b.r + POSITION_EPS && b.vy > 0) add({t: 0, nx: 0, ny: -1}, {id: 'floor'});
        else if (b.vy > VELOCITY_EPS) add({t: (bounds.floor - b.r - b.y) / b.vy, nx: 0, ny: -1}, {id: 'floor'});
      }
    }
    for (const cell of world.colliders(b, duration)) {
      if (!ignored.has(cell.id)) add(sweepCircleRect(b, cell, duration), {id: cell.id, cell});
    }
    let paddle;
    if (world.paddle) {
      const path = world.paddle, moving = elapsed < path.movingUntil - TIME_EPS;
      paddle = {x: path.x + path.vx * Math.min(elapsed, path.movingUntil), y: path.y, w: path.w, vx: moving ? path.vx : 0};
      add(sweepPaddle(b, paddle, duration), {id: 'paddle'});
    }
    if (!contacts.length) {
      b.x += b.vx * duration; b.y += b.vy * duration; elapsed += duration;
      continue;
    }
    iterations++;
    const recovery = contacts.filter(hit => hit.recovery).sort((a, c) => a.depth - c.depth || String(a.id).localeCompare(String(c.id)))[0];
    if (recovery) {
      recovered.add(recovery.id);
      b.x += recovery.nx * (recovery.depth + POSITION_EPS);
      b.y += recovery.ny * (recovery.depth + POSITION_EPS);
      // Do not ignore recovered solids: another surface must not relocate the
      // ball back through them. The bounded solver freezes ambiguous overlaps.
      world.trace?.({category: 'overlap-recovery', step: dt, elapsed, remaining: dt - elapsed, iterations, x: b.x, y: b.y, radius: b.r, contacts: [{...recovery, pointX: b.x - recovery.nx * b.r, pointY: b.y - recovery.ny * b.r}], incoming: {vx: b.vx, vy: b.vy}, outgoing: {vx: b.vx, vy: b.vy}});
      continue;
    }
    b.x += b.vx * earliest; b.y += b.vy * earliest; elapsed += earliest;
    contacts.sort((a, c) => typeof a.id === 'number' && typeof c.id === 'number' ? a.id - c.id : String(a.id).localeCompare(String(c.id)));
    const incoming = {vx: b.vx, vy: b.vy}, solid = [];
    for (const hit of contacts) {
      if (hit.cell && !recovered.has(hit.id)) world.impact?.(hit.cell);
      if (hit.cell && world.pierce?.(hit.cell)) ignored.add(hit.id);
      else solid.push(hit);
    }
    let category = 'geometric-reflection';
    const paddleHit = solid.find(hit => hit.paddle);
    if (paddleHit) {
      const impactX = paddle.x + paddle.vx * earliest;
      if (paddleHit.face === 'top') {
        Object.assign(b, steer((b.x - impactX) / (paddle.w / 2), world.speed));
        category = 'paddle-steering';
      } else {
        const relative = reflect(b.vx - paddleHit.ux, b.vy, paddleHit.nx, paddleHit.ny);
        const vx = relative.vx + paddleHit.ux, magnitude = Math.hypot(vx, relative.vy);
        if (magnitude > VELOCITY_EPS) { b.vx = vx * world.speed / magnitude; b.vy = relative.vy * world.speed / magnitude; }
        category = 'paddle-cap';
      }
      world.bounce?.();
    } else Object.assign(b, reflectManifold(b.vx, b.vy, solid));
    // Position is already at exact TOI. No angle clamp or random push changes
    // ordinary flight. Approach rejection prevents repeating this same contact.
    world.trace?.({category, step: dt, elapsed, remaining: dt - elapsed, iterations, x: b.x, y: b.y, radius: b.r, contacts: contacts.map(hit => ({...hit, pointX: b.x - hit.nx * b.r, pointY: b.y - hit.ny * b.r})), incoming, outgoing: {vx: b.vx, vy: b.vy}});
  }
  if (elapsed < dt - TIME_EPS) {
    // Safe freeze of residual motion, never a blind advance through geometry.
    world.exhausted?.({x: b.x, y: b.y, remaining: dt - elapsed, iterations});
    world.trace?.({category: 'iteration-limit', step: dt, elapsed, remaining: dt - elapsed, iterations, x: b.x, y: b.y, radius: b.r});
  }
  return {elapsed, iterations, exhausted: elapsed < dt - TIME_EPS};
}
