// Presentation metadata for the game-select cards. Accent maps to a CSS
// custom property in the clients; category maps to a translated tag label
// (i18n key `gameTag.<category>`).
export type GameAccent =
  | 'gold'
  | 'pink'
  | 'violet'
  | 'cyan'
  | 'lime'
  | 'amber'
  | 'danger'
  | 'blue';

export type GameCategory =
  | 'quiz'
  | 'drawing'
  | 'drawing-bluff'
  | 'bluff'
  | 'party'
  | 'speed'
  | 'team'
  | 'cards'
  | 'action'
  | 'word';

export interface GameDefinition {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  description: string;
  // Emoji identity shown on the game-select card / sheet (not translated).
  icon: string;
  // Accent tint token → resolved to a CSS var by the client.
  accent: GameAccent;
  // Category tag token → resolved to a translated label via i18n.
  category: GameCategory;
  // Rough game length in minutes, shown in the card's meta row.
  estimatedMinutes: number;
  // Playable in a hostless room (no TV screen) — the controller UI shows
  // everything needed to play. Games without this flag can only start in
  // rooms that have a host screen.
  supportsHostless?: boolean;
  // Score semantics: fewer points = better placement (e.g. Zavet's "uroci").
  // Clients that rank finalScores must sort ASCENDING for these games.
  lowerScoreWins?: boolean;
  // A guest who knocks mid-game and is let in joins the running game right
  // away (from the next question). Only for modules verified to cope with a
  // player who wasn't there at onStart — the rest seat admitted guests when
  // the game ends.
  lateJoin?: boolean;
  // Has a short host-led "proba" (tutorial mode): phases advance on the
  // holder's button, every phone gets a personal tip, no scoring. Drives the
  // Proba / Prava igra choice at game select (Tok igre 3a).
  tutorial?: { blurb: string; minutes: number };
}

export type GamePhase = string;

/**
 * Who the current input phase is waiting on. Player ids only — never what
 * anyone answered. `doneIds` is omitted where "who already acted" would
 * itself leak something (Gluvo doba's night), leaving just the count.
 */
export interface GameFlowCollection {
  expectedIds: string[];
  doneIds?: string[];
  doneCount: number;
  verb: 'answered' | 'wrote' | 'voted' | 'acted';
}

/**
 * Platform-level flow around a running game (pause, "who are we waiting
 * for", skip). Rides its own `game:flow` event rather than GameState, so
 * modules, the state signature and per-game clients stay untouched.
 */
export interface GameFlowState {
  paused: boolean;
  /** Name of the player who paused; null = the TV (or nobody). */
  pausedBy: string | null;
  /** Server-driven 3-2-1 before a paused game resumes. */
  resumeCountdown: 3 | 2 | 1 | null;
  collection: GameFlowCollection | null;
  /** Label for the host's skip button; null = this phase can't be skipped. */
  skipLabel: string | null;
  /** Players the host chose not to wait for (until they act or reconnect). */
  notWaitingIds: string[];
  round: number;
  totalRounds: number;
}

export interface GameState {
  gameId: string;
  phase: GamePhase;
  round: number;
  totalRounds: number;
  timeRemaining: number;
  data: Record<string, unknown>;
  playerData: Record<string, Record<string, unknown>>;
}
