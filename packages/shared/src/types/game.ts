export interface GameDefinition {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  description: string;
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
