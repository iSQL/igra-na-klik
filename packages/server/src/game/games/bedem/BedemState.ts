import type {
  BedemFrameShot,
  BedemLayout,
  BedemLength,
  BedemMode,
  BedemPhase,
  BedemResult,
} from '@igra/shared';
import type { SimMap } from './sim.js';

/**
 * Wait durations (admin-tunable via GAME_TIMING_DEFS). Build time and the
 * waves themselves are gameplay balance and live in bedem-rules.ts.
 */
export const UVOD_DURATION = 5;
export const KRAJ_DURATION = 10;

export interface BedemStats {
  kills: number;
  damage: number;
  built: number;
  /** Enemies sent at others ('protiv'). */
  sent: number;
  bossKills: number;
  /** Waves this player's base came through. */
  waves: number;
  /** Final place ('protiv'); 0 until decided. */
  place: number;
}

export function emptyStats(): BedemStats {
  return { kills: 0, damage: 0, built: 0, sent: 0, bossKills: 0, waves: 0, place: 0 };
}

export interface BedemInternalState {
  phase: BedemPhase;
  /** Seconds left in a timed phase (gradnja, uvod, kraj). 0 during a wave. */
  phaseTimeRemaining: number;
  mode: BedemMode;
  length: BedemLength;
  /** null = endless */
  totalWaves: number | null;
  /** The wave being fought, or the one being built for. */
  wave: number;
  layout: BedemLayout;
  pathCells: Set<string>;
  pathLength: number;
  maps: SimMap[];
  /** Everyone still in the game, seating order. */
  order: string[];
  /** playerId → index into `maps` */
  mapOf: Map<string, number>;
  gold: Map<string, number>;
  /** 'protiv': permanent income bought by sending. */
  bonusIncome: Map<string, number>;
  sendsThisWave: Map<string, number>;
  stats: Map<string, BedemStats>;
  /** gradnja: who pressed "Spreman", and the snapshot it's checked against. */
  ready: Set<string>;
  expectedReady: Set<string>;
  /** 'protiv': ids in the order their gate fell. */
  fallen: string[];
  nextTowerId: number;
  result?: BedemResult;
  frameSeq: number;
  frameAccumMs: number;
  /** Per map, shots and leaks banked since the last frame. */
  shotBuffer: BedemFrameShot[][];
  leakBuffer: number[];
  pendingFrame: unknown | null;
  dirty: boolean;
  lastSecond: number;
}
