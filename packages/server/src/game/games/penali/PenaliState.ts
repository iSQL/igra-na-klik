import type {
  PenaliPhase,
  PenaliPoint,
  PenaliShotResult,
  PenaliZone,
} from '@igra/shared';

// Wait phases (tunable via /admin → Timinzi, see GAME_TIMING_DEFS).
export const INTRO_DURATION = 4;
export const SHOT_DURATION = 7;
export const LEADERBOARD_DURATION = 6;
// Active input — gameplay balance, stays in code.
export const AIMING_DURATION = 12;

export interface PenaliTurn {
  shooterId: string;
  keeperId: string;
  /** Committed during `aiming`; null until then. Never leaves the server. */
  aim: PenaliPoint | null;
  power: number | null;
  zone: PenaliZone | null;
  /** Filled at resolution and published for the `shot` phase only. */
  result: PenaliShotResult | null;
}

export interface PenaliPlayerStats {
  shots: number;
  goals: number;
  cornerGoals: number;
  misses: number;
  keptTurns: number;
  saves: number;
  /** Turns where the keeper never picked a corner and stayed rooted. */
  frozen: number;
}

export function emptyStats(): PenaliPlayerStats {
  return {
    shots: 0,
    goals: 0,
    cornerGoals: 0,
    misses: 0,
    keptTurns: 0,
    saves: 0,
    frozen: 0,
  };
}

export interface PenaliInternalState {
  phase: PenaliPhase;
  phaseTimeRemaining: number;
  currentRound: number;
  totalRounds: number;
  /**
   * Shooting order, fixed at game start and pruned when a player is removed
   * past their reconnect grace. Turn i pairs order[i] (shooter) with
   * order[i+1] (keeper), so one full pass gives everyone both roles.
   */
  order: string[];
  /** Index into `order` for the current turn of the current round. */
  turnIndex: number;
  turn: PenaliTurn;
  stats: Map<string, PenaliPlayerStats>;
}
