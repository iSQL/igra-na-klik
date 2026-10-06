// Bedem — maps, towers, enemies, waves and economy. Shared because the server
// simulates with them and both screens draw with them (ranges, costs, the
// path); a second copy would drift the instant either side is tuned.
//
// Everything is in cell units (see types/bedem.ts). Balance was tuned with
// `npx tsx scripts/test-bedem.mts --balance` — re-run it before changing the
// numbers below.

import type {
  BedemEnemyType,
  BedemLength,
  BedemMode,
  BedemSendType,
  BedemTowerType,
} from '../types/bedem.js';

// --- Loop ------------------------------------------------------------------

/** Simulation step (fast tick, see IGameModule.tickIntervalMs). */
export const BEDEM_TICK_MS = 50;
/** Target gap between positional frames (~10/s), counted in accumulated ms. */
export const BEDEM_FRAME_INTERVAL_MS = 100;
/** How far behind live the screens render, ms — one frame gap plus slack. */
export const BEDEM_RENDER_DELAY_MS = 160;

// --- Match -----------------------------------------------------------------

export const BEDEM_MIN_PLAYERS = 2;
export const BEDEM_MAX_PLAYERS = 8;

export const BEDEM_WAVES: Record<BedemLength, number | null> = {
  kratko: 7,
  standard: 10,
  beskonacno: null,
};
/** Endless guard — nobody should be alive here, it just stops a stuck game. */
export const BEDEM_ENDLESS_CAP = 60;

export const BEDEM_LIVES = 20;
export const BEDEM_START_GOLD = 150;
/** Paid to every player at the start of each build phase (from wave 2). */
export function bedemWaveIncome(wave: number): number {
  return 25 + 4 * wave;
}
/** Seconds to build before a wave. The first one is longer — nothing's on the map yet. */
export const BEDEM_FIRST_BUILD_S = 30;
export const BEDEM_BUILD_S = 15;
/** Share of the gold spent on a tower that selling it returns. */
export const BEDEM_SELL_REFUND = 0.7;

// --- Scoring ---------------------------------------------------------------

/** Per wave the player's base survived. */
export const BEDEM_WAVE_POINTS = 20;
/** 'zajedno': everyone, when the base holds through the last wave. */
export const BEDEM_WIN_POINTS = 200;
/** 'protiv': by final place (index 0 = winner). Dominates kill points on purpose. */
export const BEDEM_PLACE_POINTS = [500, 250, 120, 60, 30, 15, 0, 0];

// --- Towers ----------------------------------------------------------------

export interface BedemTowerLevel {
  /** Cost of reaching this level (level 1 = build price). */
  cost: number;
  damage: number;
  /** cells */
  range: number;
  cooldownMs: number;
  /** katapult / led: hits everything this close to the target, cells */
  splash?: number;
  /** led: speed taken off, 0–1, for slowMs */
  slow?: number;
  slowMs?: number;
  /** munja: how many enemies the bolt reaches in total */
  chain?: number;
}

export interface BedemTowerDef {
  type: BedemTowerType;
  name: string;
  emoji: string;
  /** One line for the build sheet. */
  blurb: string;
  color: string;
  /** Ignores armour. */
  pierce?: boolean;
  levels: [BedemTowerLevel, BedemTowerLevel, BedemTowerLevel];
}

export const BEDEM_TOWERS: Record<BedemTowerType, BedemTowerDef> = {
  strelac: {
    type: 'strelac',
    name: 'Strelac',
    emoji: '🏹',
    blurb: 'Jeftin i brz, jedna meta',
    color: '#C29B47',
    levels: [
      { cost: 50, damage: 11, range: 2.5, cooldownMs: 520 },
      { cost: 45, damage: 18, range: 2.8, cooldownMs: 470 },
      { cost: 80, damage: 30, range: 3.1, cooldownMs: 420 },
    ],
  },
  katapult: {
    type: 'katapult',
    name: 'Katapult',
    emoji: '🪨',
    blurb: 'Spor, pogađa celu gomilu',
    color: '#B5835A',
    levels: [
      { cost: 90, damage: 26, range: 3, cooldownMs: 1700, splash: 0.9 },
      { cost: 75, damage: 42, range: 3.2, cooldownMs: 1600, splash: 1 },
      { cost: 120, damage: 68, range: 3.5, cooldownMs: 1500, splash: 1.15 },
    ],
  },
  led: {
    type: 'led',
    name: 'Ledena kula',
    emoji: '❄️',
    blurb: 'Usporava sve oko mete',
    color: '#7FB7E0',
    levels: [
      { cost: 70, damage: 4, range: 2.2, cooldownMs: 900, splash: 0.7, slow: 0.4, slowMs: 1500 },
      { cost: 60, damage: 7, range: 2.5, cooldownMs: 850, splash: 0.85, slow: 0.5, slowMs: 1700 },
      { cost: 90, damage: 11, range: 2.8, cooldownMs: 800, splash: 1, slow: 0.6, slowMs: 1900 },
    ],
  },
  munja: {
    type: 'munja',
    name: 'Munja',
    emoji: '⚡',
    blurb: 'Skače na 3 mete, probija oklop',
    color: '#B9A3E3',
    pierce: true,
    levels: [
      { cost: 140, damage: 30, range: 2.6, cooldownMs: 1250, chain: 3 },
      { cost: 110, damage: 46, range: 2.9, cooldownMs: 1150, chain: 4 },
      { cost: 160, damage: 70, range: 3.2, cooldownMs: 1050, chain: 5 },
    ],
  },
};

export const BEDEM_TOWER_ORDER: BedemTowerType[] = ['strelac', 'katapult', 'led', 'munja'];

/** Each bolt jump looks this far for the next victim and keeps this share of damage. */
export const BEDEM_CHAIN_JUMP = 1.6;
export const BEDEM_CHAIN_FALLOFF = 0.8;
/** Armour can't soak more than this share of a hit — a weak tower still scratches. */
export const BEDEM_ARMOR_FLOOR = 0.25;

// --- Enemies ---------------------------------------------------------------

export interface BedemEnemyDef {
  type: BedemEnemyType;
  name: string;
  emoji: string;
  hp: number;
  /** cells per second */
  speed: number;
  /** flat damage taken off every non-piercing hit */
  armor: number;
  bounty: number;
  /** lives lost when it reaches the gate */
  leak: number;
  /** drawn radius, cells */
  size: number;
}

export const BEDEM_ENEMIES: Record<BedemEnemyType, BedemEnemyDef> = {
  vuk: { type: 'vuk', name: 'Vuk', emoji: '🐺', hp: 30, speed: 1.9, armor: 0, bounty: 3, leak: 1, size: 0.26 },
  pesak: { type: 'pesak', name: 'Pešak', emoji: '🧟', hp: 55, speed: 1.1, armor: 0, bounty: 4, leak: 1, size: 0.28 },
  oklopnik: {
    type: 'oklopnik',
    name: 'Oklopnik',
    emoji: '🛡️',
    hp: 120,
    speed: 0.8,
    armor: 7,
    bounty: 8,
    leak: 2,
    size: 0.33,
  },
  roj: { type: 'roj', name: 'Roj', emoji: '🦇', hp: 14, speed: 1.5, armor: 0, bounty: 1, leak: 1, size: 0.18 },
  azdaja: {
    type: 'azdaja',
    name: 'Aždaja',
    emoji: '🐉',
    hp: 650,
    speed: 0.55,
    armor: 5,
    bounty: 60,
    leak: 8,
    size: 0.45,
  },
};

/** Enemy HP multiplier for wave `n` — keeps growing, which is what ends an endless game. */
export function bedemHpScale(wave: number): number {
  // Exponential on purpose: gentle while the first towers go up, then it
  // outgrows any economy, which is what ends an endless game.
  return Math.pow(1.2, Math.max(0, wave - 1));
}

/**
 * Extra HP on the shared map per additional builder. `bedemWave` already adds
 * bodies; this keeps a six-player wall from turning every wave into a stroll.
 */
export function bedemTeamHpScale(players: number): number {
  const table = [1, 1, 1.3, 1.6, 1.85, 2.05, 2.2, 2.32, 2.42];
  return table[Math.max(1, Math.min(8, players))];
}

// --- Sending ('protiv') ----------------------------------------------------

export interface BedemSendDef {
  type: BedemSendType;
  enemy: BedemEnemyType;
  count: number;
  cost: number;
  /** Added to the sender's income every following wave — attacking is also investing. */
  income: number;
}

export const BEDEM_SENDS: Record<BedemSendType, BedemSendDef> = {
  vuk: { type: 'vuk', enemy: 'vuk', count: 2, cost: 20, income: 2 },
  roj: { type: 'roj', enemy: 'roj', count: 6, cost: 30, income: 3 },
  oklopnik: { type: 'oklopnik', enemy: 'oklopnik', count: 1, cost: 45, income: 4 },
};
export const BEDEM_SEND_ORDER: BedemSendType[] = ['vuk', 'roj', 'oklopnik'];
/** Warning time on the victim's screen before a send walks in. */
export const BEDEM_SEND_DELAY_MS = 2500;
/** Per player per wave, so nobody can drown a map in one tap-storm. */
export const BEDEM_SEND_CAP = 10;

// --- Waves -----------------------------------------------------------------

export interface BedemSpawnGroup {
  enemy: BedemEnemyType;
  count: number;
  /** ms between two of this group */
  gapMs: number;
  /** ms after the previous group STARTED */
  afterMs: number;
}

/**
 * The composition of wave `n`. Pure, so the server, the balance script and a
 * "next wave" preview all agree. `players` scales the shared map in 'zajedno'
 * (everyone brings gold); in 'protiv' every map is a 1-player map.
 */
export function bedemWave(wave: number, players: number): BedemSpawnGroup[] {
  const extra = 1 + 0.4 * Math.max(0, players - 1);
  const n = (base: number) => Math.max(1, Math.round(base * extra));
  const groups: BedemSpawnGroup[] = [];

  groups.push({ enemy: 'pesak', count: n(5 + 1.5 * wave), gapMs: 850, afterMs: 0 });
  if (wave >= 2) groups.push({ enemy: 'vuk', count: n(2 + wave), gapMs: 550, afterMs: 2500 });
  if (wave >= 3 && wave % 3 === 0) {
    groups.push({ enemy: 'roj', count: n(10 + 2 * wave), gapMs: 220, afterMs: 3500 });
  }
  if (wave >= 4) {
    groups.push({ enemy: 'oklopnik', count: n(1 + Math.floor(wave / 2)), gapMs: 1500, afterMs: 3000 });
  }
  if (wave % 5 === 0) {
    const bosses = 1 + Math.floor((wave - 5) / 10) + (players >= 4 ? 1 : 0);
    groups.push({ enemy: 'azdaja', count: bosses, gapMs: 4000, afterMs: 3500 });
  }
  if (wave >= 6) groups.push({ enemy: 'vuk', count: n(wave), gapMs: 400, afterMs: 2500 });
  return groups;
}

export function bedemWaveHasBoss(wave: number): boolean {
  return wave % 5 === 0;
}

// --- Maps ------------------------------------------------------------------

export interface BedemLayout {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /**
   * Waypoints in cell coordinates; consecutive points share a row or a
   * column. The first sits one row above the grid (the entrance), the last
   * one row below it (the gate).
   */
  path: [number, number][];
}

export const BEDEM_LAYOUTS: BedemLayout[] = [
  {
    id: 'zmija',
    name: 'Zmija',
    cols: 8,
    rows: 12,
    path: [[1, -1], [1, 2], [6, 2], [6, 5], [1, 5], [1, 8], [6, 8], [6, 10], [3, 10], [3, 12]],
  },
  {
    id: 'kuke',
    name: 'Kuke',
    cols: 8,
    rows: 12,
    path: [[6, -1], [6, 1], [1, 1], [1, 4], [5, 4], [5, 7], [2, 7], [2, 10], [6, 10], [6, 12]],
  },
  {
    id: 'reka',
    name: 'Reka',
    cols: 9,
    rows: 14,
    path: [[1, -1], [1, 2], [7, 2], [7, 5], [1, 5], [1, 8], [7, 8], [7, 11], [4, 11], [4, 14]],
  },
  {
    id: 'lavirint',
    name: 'Lavirint',
    cols: 9,
    rows: 14,
    path: [
      [7, -1], [7, 1], [1, 1], [1, 4], [6, 4], [6, 7], [2, 7], [2, 10], [7, 10], [7, 12], [4, 12], [4, 14],
    ],
  },
];

/** Big shared maps only once the shared map has 4+ builders on it. */
export function bedemLayoutsFor(mode: BedemMode, players: number): BedemLayout[] {
  const big = mode === 'zajedno' && players >= 4;
  return BEDEM_LAYOUTS.filter((l) => (big ? l.rows > 12 : l.rows === 12));
}

export function bedemLayout(id: string): BedemLayout {
  return BEDEM_LAYOUTS.find((l) => l.id === id) ?? BEDEM_LAYOUTS[0];
}

/** Every grid cell the path covers, as "c,r" keys. */
export function bedemPathCells(path: [number, number][]): Set<string> {
  const cells = new Set<string>();
  for (let i = 1; i < path.length; i++) {
    const [c0, r0] = path[i - 1];
    const [c1, r1] = path[i];
    const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
    for (let k = 0; k <= steps; k++) {
      const c = c0 + Math.sign(c1 - c0) * k;
      const r = r0 + Math.sign(r1 - r0) * k;
      cells.add(`${c},${r}`);
    }
  }
  return cells;
}

/** Total walking distance from the entrance to the gate, cells. */
export function bedemPathLength(path: [number, number][]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    len += Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]);
  }
  return len;
}

/** Where an enemy `dist` cells down the path stands (cell centres, cell units). */
export function bedemPathPoint(path: [number, number][], dist: number): { x: number; y: number } {
  let left = Math.max(0, dist);
  for (let i = 1; i < path.length; i++) {
    const [c0, r0] = path[i - 1];
    const [c1, r1] = path[i];
    const seg = Math.abs(c1 - c0) + Math.abs(r1 - r0);
    if (left <= seg || i === path.length - 1) {
      const k = seg === 0 ? 0 : Math.min(1, left / seg);
      return { x: c0 + (c1 - c0) * k + 0.5, y: r0 + (r1 - r0) * k + 0.5 };
    }
    left -= seg;
  }
  const [c, r] = path[path.length - 1];
  return { x: c + 0.5, y: r + 0.5 };
}

/** Can a tower stand on (c, r)? Inside the grid and off the path. */
export function bedemBuildable(
  layout: { cols: number; rows: number },
  pathCells: Set<string>,
  c: number,
  r: number
): boolean {
  return (
    Number.isInteger(c) &&
    Number.isInteger(r) &&
    c >= 0 &&
    r >= 0 &&
    c < layout.cols &&
    r < layout.rows &&
    !pathCells.has(`${c},${r}`)
  );
}

/** Gold a level-`level` tower of `type` costs to raise one level, or null at max. */
export function bedemUpgradeCost(type: BedemTowerType, level: number): number | null {
  const next = BEDEM_TOWERS[type].levels[level];
  return next ? next.cost : null;
}

export function bedemSellValue(spent: number): number {
  return Math.floor(spent * BEDEM_SELL_REFUND);
}

export function clampBedemMode(raw: unknown): BedemMode {
  return raw === 'protiv' ? 'protiv' : 'zajedno';
}

export function clampBedemLength(raw: unknown): BedemLength {
  return raw === 'kratko' || raw === 'beskonacno' ? raw : 'standard';
}
