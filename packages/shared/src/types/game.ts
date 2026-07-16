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
  | 'cards';

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
}

export type GamePhase = string;

export interface GameState {
  gameId: string;
  phase: GamePhase;
  round: number;
  totalRounds: number;
  timeRemaining: number;
  data: Record<string, unknown>;
  playerData: Record<string, Record<string, unknown>>;
}
