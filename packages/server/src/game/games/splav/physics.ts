import {
  SPLAV_ACCEL,
  SPLAV_BUMP_RESTITUTION,
  SPLAV_CREDIT_WINDOW_MS,
  SPLAV_DASH_COOLDOWN_MS,
  SPLAV_DASH_MS,
  SPLAV_DASH_PUSH,
  SPLAV_DASH_RECOIL,
  SPLAV_DASH_RESTITUTION,
  SPLAV_DASH_SPEED,
  SPLAV_DRAG,
  SPLAV_HIT_FLASH_IMPULSE,
  SPLAV_MAX_SPEED,
  SPLAV_PLAYER_RADIUS,
  splavArenaCenter,
  splavArenaRadius,
} from '@igra/shared';

/**
 * One player in the simulation. Times are all "round clock" milliseconds
 * (ms since the round started), never wall clock — that keeps the whole step
 * deterministic and replayable from a round's tick sequence.
 */
export interface SplavBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Latest joystick vector, already clamped to the unit disc. */
  inx: number;
  iny: number;
  /** Last non-zero heading — a dash with a centred stick goes this way. */
  faceX: number;
  faceY: number;
  /** Round-clock ms the current dash burst ends at (0 = not dashing). */
  dashUntil: number;
  /** Round-clock ms the next dash becomes available. */
  dashReadyAt: number;
  alive: boolean;
  /** Who last shoved this player, and when — the elimination credit window. */
  lastHitBy: string | null;
  lastHitAt: number;
  /** Round-clock ms of this player's last hard collision (TV impact flash). */
  lastImpactAt: number;
  /** Round-clock ms they went into the water (−1 while alive). */
  outAt: number;
}

export interface SplavElimHit {
  id: string;
  /** Who gets the points — null when the raft (or their own driving) did it. */
  byId: string | null;
}

export function createBody(id: string, x: number, y: number): SplavBody {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    inx: 0,
    iny: 0,
    // Face the middle of the raft, so an opening dash isn't a coin flip.
    faceX: -x || 1,
    faceY: -y,
    dashUntil: 0,
    dashReadyAt: 0,
    alive: true,
    lastHitBy: null,
    lastHitAt: -Infinity,
    lastImpactAt: -Infinity,
    outAt: -1,
  };
}

/** Dash readiness as 0–1, for the ring around the phone's dash button. */
export function dashCooldownProgress(body: SplavBody, now: number): number {
  const left = body.dashReadyAt - now;
  if (left <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - left / SPLAV_DASH_COOLDOWN_MS));
}

/**
 * Start a dash if it's off cooldown. Returns true when the burst actually
 * fired, so the caller can decide whether to buzz the phone.
 */
export function startDash(body: SplavBody, now: number): boolean {
  if (!body.alive || now < body.dashReadyAt) return false;
  let dx = body.inx;
  let dy = body.iny;
  if (dx === 0 && dy === 0) {
    dx = body.faceX;
    dy = body.faceY;
  }
  const len = Math.hypot(dx, dy);
  if (len === 0) return false;
  body.vx = (dx / len) * SPLAV_DASH_SPEED;
  body.vy = (dy / len) * SPLAV_DASH_SPEED;
  body.dashUntil = now + SPLAV_DASH_MS;
  body.dashReadyAt = now + SPLAV_DASH_COOLDOWN_MS;
  return true;
}

export function isDashing(body: SplavBody, now: number): boolean {
  return body.alive && now < body.dashUntil;
}

/**
 * Advance the simulation by `dtMs`. Steering → integration → collisions →
 * edge check, in that order; anything who ends the step with their centre off
 * the raft is in the water.
 *
 * Collisions are the expensive part of this game (unlike, say, a race, players
 * MUST be able to shove each other), but with ≤8 circles the naive O(n²) pass
 * is a few dozen distance checks per tick — a broadphase would be more code
 * than it saves.
 */
export function stepSimulation(
  bodies: SplavBody[],
  elapsedMs: number,
  dtMs: number
): SplavElimHit[] {
  const dt = dtMs / 1000;
  const now = elapsedMs;
  const alive = bodies.filter((b) => b.alive);

  // --- steer + integrate ---------------------------------------------------
  for (const b of alive) {
    if (isDashing(b, now)) {
      // A dash is a commitment: locked heading, no drag, no steering out of it.
      // That's what makes "when do I spend it" the whole tactic.
    } else {
      b.vx += b.inx * SPLAV_ACCEL * dt;
      b.vy += b.iny * SPLAV_ACCEL * dt;
      const damp = Math.max(0, 1 - SPLAV_DRAG * dt);
      b.vx *= damp;
      b.vy *= damp;
    }

    const speed = Math.hypot(b.vx, b.vy);
    if (speed > SPLAV_MAX_SPEED) {
      b.vx = (b.vx / speed) * SPLAV_MAX_SPEED;
      b.vy = (b.vy / speed) * SPLAV_MAX_SPEED;
    }

    if (b.inx !== 0 || b.iny !== 0) {
      b.faceX = b.inx;
      b.faceY = b.iny;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  // --- collisions ----------------------------------------------------------
  const minDist = SPLAV_PLAYER_RADIUS * 2;
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      if (dist >= minDist) continue;

      // Perfectly stacked (spawn overlap, or two dashes meeting head-on at the
      // same point): pick an arbitrary axis rather than dividing by zero.
      if (dist === 0) {
        dx = 1;
        dy = 0;
        dist = 0.0001;
      }
      const nx = dx / dist;
      const ny = dy / dist;

      // Separate first so the pair can't tunnel through each other.
      const overlap = (minDist - dist) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;

      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn > 0) continue; // already separating

      const aDash = isDashing(a, now);
      const bDash = isDashing(b, now);
      const e = aDash || bDash ? SPLAV_DASH_RESTITUTION : SPLAV_BUMP_RESTITUTION;
      const base = (-(1 + e) * vn) / 2;

      let pushA = base;
      let pushB = base;
      if (aDash && !bDash) {
        pushB = base * SPLAV_DASH_PUSH;
        pushA = base * SPLAV_DASH_RECOIL;
      } else if (bDash && !aDash) {
        pushA = base * SPLAV_DASH_PUSH;
        pushB = base * SPLAV_DASH_RECOIL;
      }

      a.vx -= nx * pushA;
      a.vy -= ny * pushA;
      b.vx += nx * pushB;
      b.vy += ny * pushB;

      // A dash spends itself on contact — one burst, one shove.
      if (aDash) a.dashUntil = now;
      if (bDash) b.dashUntil = now;

      // Last touch decides who gets paid if the other one goes in. Recorded
      // for both sides: whoever you bumped into is your killer if you fall.
      a.lastHitBy = b.id;
      a.lastHitAt = now;
      b.lastHitBy = a.id;
      b.lastHitAt = now;

      if (base >= SPLAV_HIT_FLASH_IMPULSE) {
        a.lastImpactAt = now;
        b.lastImpactAt = now;
      }
    }
  }

  // --- edge ----------------------------------------------------------------
  const radius = splavArenaRadius(now);
  const center = splavArenaCenter(now);
  const eliminated: (SplavElimHit & { over: number })[] = [];
  for (const b of alive) {
    const d = Math.hypot(b.x - center.x, b.y - center.y);
    if (d <= radius) continue;
    b.alive = false;
    b.outAt = now;
    b.vx = 0;
    b.vy = 0;
    const credited =
      b.lastHitBy && now - b.lastHitAt <= SPLAV_CREDIT_WINDOW_MS
        ? b.lastHitBy
        : null;
    eliminated.push({ id: b.id, byId: credited, over: d - radius });
  }

  // Two people can go over on the same tick, and elimination order decides
  // placement. Ranking them by how far past the edge they ended puts that on
  // the physics rather than on whatever order the bodies happen to sit in —
  // otherwise a 1v1 double-out would always be won by the same seat.
  eliminated.sort((a, b) => b.over - a.over);
  return eliminated.map(({ id, byId }) => ({ id, byId }));
}
