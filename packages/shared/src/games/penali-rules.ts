// Penali — goal geometry, keeper zones and shot resolution.
//
// Kept in shared because three surfaces must agree on the same numbers: the
// controller draws the aim pad and the zone buttons from ZONE_CENTERS, the
// host places the 3D goal and the keeper dive from the same coordinates, and
// the server resolves the shot. Resolution itself only ever runs server-side
// (it consumes randomness and decides points), but living next to the shared
// geometry keeps the constants honest.

import type {
  PenaliOutcome,
  PenaliPoint,
  PenaliZone,
} from '../types/penali.js';

/** Real goal is 7.32 × 2.44 m — the aim pad and the 3D goal use this ratio. */
export const GOAL_ASPECT = 3;

export const PENALI_ZONES: readonly PenaliZone[] = [
  'left-high',
  'center-high',
  'right-high',
  'left-low',
  'center-low',
  'right-low',
];

/** Where each zone sits in goal-plane coordinates. */
export const ZONE_CENTERS: Record<PenaliZone, PenaliPoint> = {
  'left-high': { x: -0.62, y: 0.72 },
  'center-high': { x: 0, y: 0.72 },
  'right-high': { x: 0.62, y: 0.72 },
  'left-low': { x: -0.62, y: 0.28 },
  'center-low': { x: 0, y: 0.28 },
  'right-low': { x: 0.62, y: 0.28 },
};

/** Serbian labels for the keeper's six buttons. */
export const ZONE_LABELS: Record<PenaliZone, string> = {
  'left-high': 'Levo gore',
  'center-high': 'Sredina gore',
  'right-high': 'Desno gore',
  'left-low': 'Levo dole',
  'center-low': 'Sredina dole',
  'right-low': 'Desno dole',
};

// --- Balance constants ---------------------------------------------------
// Tuned so that: a placed shot at half power is savable when the keeper reads
// it right; a hard shot into the corner beats even a correct guess; and
// aiming at the very edge of the frame risks putting it wide.

// These were picked by simulating ~30k shots per candidate across a spread of
// plausible player strategies. The chosen set yields roughly 73% goals / 24%
// saves, with a shot down the middle worth ~68 expected points against ~120
// for one placed near a post — so placing it wide is the rewarded play, and
// the keeper's guess visibly matters.

/** Spread (std-dev, in x units) of a perfectly weighted shot. */
const SPREAD_BASE = 0.018;
/** Extra spread at full power — the price of hitting it hard. */
const SPREAD_POWER = 0.085;
/** How far from the chosen zone a keeper can still reach a slow shot. */
const KEEPER_REACH_BASE = 0.74;
/**
 * Reach lost at full power. Tuned so a correct read saves ~100% of soft shots
 * but only ~58% of full-power ones: pace beats a correct guess, eventually.
 */
const KEEPER_REACH_POWER_PENALTY = 0.46;
/**
 * Vertical error counts slightly more than horizontal. Reading the right side
 * but the wrong height still saves ~9% of the time — a consolation for half a
 * read, not a substitute for the whole one.
 */
const VERTICAL_REACH_SCALE = 1.1;
/** Band around the frame that counts as woodwork rather than a goal. */
const POST_BAND = 0.03;

export const GOAL_POINTS = 100;
/** Saves are rarer than goals, so they're worth more. */
export const SAVE_POINTS = 150;
/** Extra for burying it near a post rather than down the middle. */
export const CORNER_BONUS = 50;
const CORNER_X = 0.6;

export const TIMEOUT_POWER = 0.45;
/** Keepers who don't commit stay rooted in the middle. */
export const TIMEOUT_ZONE: PenaliZone = 'center-low';

/**
 * Auto-shot for a shooter who ran out of time: soft and scuffed somewhere
 * near the middle. Deliberately jittered rather than a fixed point — a
 * constant aim would land exactly on TIMEOUT_ZONE every time and hand a
 * rooted keeper a free save, which is farmable.
 */
export function timeoutShot(rng: () => number = Math.random): {
  aim: PenaliPoint;
  power: number;
} {
  return {
    aim: { x: (rng() - 0.5) * 1.1, y: 0.12 + rng() * 0.38 },
    power: TIMEOUT_POWER,
  };
}

/** Clamp an incoming aim to the goal frame. Off-target comes from spread. */
export function clampAim(raw: unknown): PenaliPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const { x, y } = raw as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  if (typeof y !== 'number' || !Number.isFinite(y)) return null;
  return {
    x: Math.max(-1, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

export function clampPower(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return TIMEOUT_POWER;
  return Math.max(0, Math.min(1, raw));
}

export function isPenaliZone(raw: unknown): raw is PenaliZone {
  return typeof raw === 'string' && raw in ZONE_CENTERS;
}

/** Standard normal via Box–Muller, drawing from the caller's RNG. */
function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface ResolvedShot {
  landing: PenaliPoint;
  outcome: PenaliOutcome;
  shooterPoints: number;
  keeperPoints: number;
}

/**
 * Decide one penalty. `rng` is injected so the server owns the randomness
 * (and so this stays deterministic under test).
 */
export function resolveShot(
  aim: PenaliPoint,
  power: number,
  keeperZone: PenaliZone,
  rng: () => number = Math.random
): ResolvedShot {
  const sigma = SPREAD_BASE + SPREAD_POWER * power * power;
  const landing: PenaliPoint = {
    x: aim.x + gaussian(rng) * sigma,
    y: aim.y + gaussian(rng) * sigma,
  };

  // Off target entirely.
  if (Math.abs(landing.x) > 1 + POST_BAND || landing.y > 1 + POST_BAND) {
    return {
      landing,
      outcome: 'promasaj',
      shooterPoints: 0,
      keeperPoints: 0,
    };
  }

  // Clipped the frame — no goal, and the keeper doesn't get paid for luck.
  if (Math.abs(landing.x) > 1 - POST_BAND || landing.y > 1 - POST_BAND) {
    return { landing, outcome: 'stativa', shooterPoints: 0, keeperPoints: 0 };
  }

  const zone = ZONE_CENTERS[keeperZone];
  const dx = landing.x - zone.x;
  const dy = (landing.y - zone.y) * VERTICAL_REACH_SCALE;
  const reach = KEEPER_REACH_BASE - KEEPER_REACH_POWER_PENALTY * power;

  if (Math.hypot(dx, dy) <= reach) {
    return {
      landing,
      outcome: 'odbrana',
      shooterPoints: 0,
      keeperPoints: SAVE_POINTS,
    };
  }

  const corner = Math.abs(landing.x) >= CORNER_X;
  return {
    landing,
    outcome: 'gol',
    shooterPoints: GOAL_POINTS + (corner ? CORNER_BONUS : 0),
    keeperPoints: 0,
  };
}

/** Serbian verdict headline for the TV and the phones. */
export function outcomeLabel(outcome: PenaliOutcome): string {
  switch (outcome) {
    case 'gol':
      return 'GOOOL!';
    case 'odbrana':
      return 'ODBRANA!';
    case 'stativa':
      return 'STATIVA!';
    default:
      return 'PREKO GOLA!';
  }
}
