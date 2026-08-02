// Splav — arena geometry, physics constants and scoring. Shared because the
// server simulates with them and the TV draws with them; a second copy would
// drift the instant either side is tuned.
//
// Everything is in arena units (see types/splav.ts): the raft starts as a
// unit-radius disc, so `0.085` reads as "8.5% of the starting raft".

// --- Loop ------------------------------------------------------------------

/** Simulation step. The first fast-tick game on the platform — see IGameModule.tickIntervalMs. */
export const SPLAV_TICK_MS = 25;
/**
 * Target gap between positional frames (~15/s). Counted in accumulated
 * milliseconds rather than ticks: a 25ms `setInterval` in Node drifts under
 * load, and pinning the wire rate to a tick count would drift with it.
 */
export const SPLAV_FRAME_INTERVAL_MS = 66;
/** How far behind live the TV renders, ms — one frame gap plus slack. */
export const SPLAV_RENDER_DELAY_MS = 110;

// --- Raft ------------------------------------------------------------------

export const SPLAV_START_RADIUS = 1;
/** The raft holds full size at the start so everyone can find themselves. */
export const SPLAV_HOLD_MS = 4000;
/** Main shrink: full size → SPLAV_MIN_RADIUS. */
export const SPLAV_SHRINK_MS = 22000;
export const SPLAV_MIN_RADIUS = 0.3;
/** Sudden death: keeps closing to a sliver so no round can stall. */
export const SPLAV_SUDDEN_MS = 18000;
export const SPLAV_SUDDEN_RADIUS = 0.08;
/** Hard round ceiling — by then the raft is gone anyway. */
export const SPLAV_ROUND_MAX_MS =
  SPLAV_HOLD_MS + SPLAV_SHRINK_MS + SPLAV_SUDDEN_MS;

/**
 * The raft also slides. Shrinking alone still rewards standing dead centre;
 * a drifting centre means the safe spot keeps moving and nobody can idle.
 */
export const SPLAV_DRIFT_AMPLITUDE = 0.14;
export const SPLAV_DRIFT_W1 = 0.55;
export const SPLAV_DRIFT_W2 = 0.37;

// --- Movement --------------------------------------------------------------

export const SPLAV_PLAYER_RADIUS = 0.085;
export const SPLAV_ACCEL = 2.6;
/** Linear damping per second. Terminal steering speed is ACCEL / DRAG ≈ 0.74. */
export const SPLAV_DRAG = 3.5;
/** Ceiling for knockback and dash, well above the steering terminal speed. */
export const SPLAV_MAX_SPEED = 2.2;

export const SPLAV_DASH_SPEED = 1.9;
export const SPLAV_DASH_MS = 220;
export const SPLAV_DASH_COOLDOWN_MS = 2000;
/** What the victim of a dash takes, relative to a plain bump. */
export const SPLAV_DASH_PUSH = 2.4;
/** What the dasher takes back. Low, so committing feels powerful. */
export const SPLAV_DASH_RECOIL = 0.5;
/** Bumping alone can't eject anyone — that's the dash's job. */
export const SPLAV_BUMP_RESTITUTION = 0.45;
export const SPLAV_DASH_RESTITUTION = 0.95;
/** Impulse above which the TV flashes an impact. */
export const SPLAV_HIT_FLASH_IMPULSE = 0.35;

// --- Scoring ---------------------------------------------------------------

/**
 * How long a shove keeps counting. Camping in the middle waiting for the raft
 * to do the work is the failure mode of this genre, so the push itself is
 * where the points are.
 */
export const SPLAV_CREDIT_WINDOW_MS = 4000;
export const SPLAV_ELIM_POINTS = 120;
/** Per place survived above last. */
export const SPLAV_SURVIVAL_STEP = 40;
export const SPLAV_WIN_BONUS = 120;

export const SPLAV_SPAWN_RADIUS = 0.62;

// --- Pure helpers ----------------------------------------------------------

/** Raft radius at `elapsedMs` into the round. */
export function splavArenaRadius(elapsedMs: number): number {
  const t = elapsedMs - SPLAV_HOLD_MS;
  if (t <= 0) return SPLAV_START_RADIUS;
  if (t <= SPLAV_SHRINK_MS) {
    const k = t / SPLAV_SHRINK_MS;
    return SPLAV_START_RADIUS - (SPLAV_START_RADIUS - SPLAV_MIN_RADIUS) * k;
  }
  const k = Math.min(1, (t - SPLAV_SHRINK_MS) / SPLAV_SUDDEN_MS);
  return SPLAV_MIN_RADIUS - (SPLAV_MIN_RADIUS - SPLAV_SUDDEN_RADIUS) * k;
}

/** Raft centre at `elapsedMs`. Eased in so it doesn't jerk when drift starts. */
export function splavArenaCenter(elapsedMs: number): { x: number; y: number } {
  const t = Math.max(0, elapsedMs - SPLAV_HOLD_MS) / 1000;
  const ease = Math.min(1, t / 2);
  const a = SPLAV_DRIFT_AMPLITUDE * ease;
  return {
    x: a * Math.sin(SPLAV_DRIFT_W1 * t),
    y: a * Math.sin(SPLAV_DRIFT_W2 * t + 1.1),
  };
}

/**
 * Survival points for finishing `rank`-th of `total` (1 = last one standing).
 * Placement alone is deliberately worth less than two eliminations — hiding
 * pays, but pushing pays better.
 */
export function splavSurvivalPoints(rank: number, total: number): number {
  const placed = Math.max(0, total - rank) * SPLAV_SURVIVAL_STEP;
  return placed + (rank === 1 ? SPLAV_WIN_BONUS : 0);
}

/** Evenly spaced starting spots, so nobody opens the round already cornered. */
export function splavSpawn(index: number, total: number): { x: number; y: number } {
  const a = (index / Math.max(1, total)) * Math.PI * 2;
  return {
    x: Math.cos(a) * SPLAV_SPAWN_RADIUS,
    y: Math.sin(a) * SPLAV_SPAWN_RADIUS,
  };
}

/**
 * Normalize a joystick vector off the wire: finite numbers, clamped to the
 * unit disc (so a hand-rolled client can't request 10× speed).
 */
export function clampSplavInput(rawX: unknown, rawY: unknown): { x: number; y: number } {
  const x = typeof rawX === 'number' && Number.isFinite(rawX) ? rawX : 0;
  const y = typeof rawY === 'number' && Number.isFinite(rawY) ? rawY : 0;
  const len = Math.hypot(x, y);
  if (len <= 1) return { x, y };
  return { x: x / len, y: y / len };
}
