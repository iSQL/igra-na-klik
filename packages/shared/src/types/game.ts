export interface GameDefinition {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  description: string;
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
