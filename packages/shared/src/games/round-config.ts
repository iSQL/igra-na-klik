// Per-game round configuration for the games that expose a simple "number
// of rounds" knob via the generic `roundCount` field on host:start-game.
// One source of truth for the selector options AND the server-side clamp,
// so the UI and the module can never drift apart.
//
// "Round" means different things per game — questions (kviz, lažov), passes
// where everyone draws once (crtaj i pogodi), subjects (ko sam ja), or match
// races (pronađi par) — but the knob and plumbing are identical.
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
  'ko-sam-ja': { options: [5, 8, 10], default: 8, min: 3, max: 12 },
  'spot-it': { options: [5, 10, 15], default: 10, min: 3, max: 20 },
  'bolji-zivot': { options: [1, 2, 3, 4], default: 4, min: 1, max: 6 },
  // Špijun: a "round" is one full location+spy deal (discussions are long,
  // so the default is a single round).
  spijun: { options: [1, 2, 3], default: 1, min: 1, max: 5 },
  // Penali: a "round" is one full rotation — every player shoots once and
  // keeps once — so the turn count scales with the room.
  penali: { options: [1, 2, 3], default: 2, min: 1, max: 5 },
  // Složilica: a "round" is one set of seven letters — each takes a full
  // minute plus the reveal, so three is already a decent sitting.
  slozilica: { options: [1, 2, 3], default: 3, min: 1, max: 3 },
  // Splav: a "round" is one raft — 20–40s of fighting — so the table only
  // settles after a handful of them.
  splav: { options: [4, 6, 8], default: 6, min: 2, max: 12 },
  // Asocijacije is intentionally NOT here — a game is always a single board.
  // Osvajanje isn't here either — the war runs until one castle is left
  // standing, so a round count would only cut the game short (see
  // BITKA_MAX_RATNIH_RUNDI, which is a stuck-game guard, not a setting).
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
