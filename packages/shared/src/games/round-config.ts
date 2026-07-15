// Per-game round configuration for the games that expose a simple "number
// of rounds" knob via the generic `roundCount` field on host:start-game.
// One source of truth for the selector options AND the server-side clamp,
// so the UI and the module can never drift apart.
//
// "Round" means different things per game — questions (quiz, lažov, foto
// kviz), passes where everyone draws once (crtaj i pogodi), locations
// (pogodi gde je), subjects (ko sam ja), or match races (pronađi par) — but
// the knob and plumbing are identical.
export interface GameRoundConfig {
  options: number[];
  default: number;
  min: number;
  max: number;
}

export const GAME_ROUND_CONFIG: Record<string, GameRoundConfig> = {
  quiz: { options: [5, 10, 15, 20], default: 10, min: 3, max: 20 },
  'draw-guess': { options: [1, 2, 3], default: 3, min: 1, max: 3 },
  fibbage: { options: [3, 5, 8, 10], default: 5, min: 3, max: 10 },
  'geo-pogodi': { options: [5, 8, 10, 12], default: 8, min: 3, max: 15 },
  'foto-kviz': { options: [5, 8, 10], default: 8, min: 3, max: 12 },
  'ko-sam-ja': { options: [5, 8, 10], default: 8, min: 3, max: 12 },
  'spot-it': { options: [5, 10, 15], default: 10, min: 3, max: 20 },
  'emoji-zagonetke': { options: [5, 10, 15, 20], default: 10, min: 3, max: 25 },
  'bolji-zivot': { options: [1, 2, 3, 4], default: 4, min: 1, max: 6 },
};

// Crtaj i pogodi: selectable per-turn drawing time (seconds). The host picks
// 1 / 2 / 3 minutes in game-select; the server clamps to this whitelist. One
// source of truth for the UI options and the server-side clamp.
export const DRAW_GUESS_TIME_OPTIONS = [60, 120, 180] as const;
export const DRAW_GUESS_TIME_DEFAULT = 60;

/** Clamp an incoming draw time to the allowed set, else the default (60s). */
export function clampDrawTime(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : NaN;
  return (DRAW_GUESS_TIME_OPTIONS as readonly number[]).includes(n)
    ? n
    : DRAW_GUESS_TIME_DEFAULT;
}

/**
 * Clamp an incoming roundCount for a game to its configured range, falling
 * back to the game's default when the value is missing or invalid. Games
 * not in the map return the default-ish 0 (callers should guard by key).
 */
export function clampGameRounds(gameId: string, raw: unknown): number {
  const cfg = GAME_ROUND_CONFIG[gameId];
  if (!cfg) {
    return typeof raw === 'number' && Number.isFinite(raw)
      ? Math.floor(raw)
      : 0;
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return cfg.default;
  return Math.max(cfg.min, Math.min(cfg.max, Math.floor(raw)));
}
