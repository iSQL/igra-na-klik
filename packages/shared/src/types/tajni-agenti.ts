export type TajniAgentiTeam = 'red' | 'blue';

export type TajniAgentiCardType =
  | 'red'
  | 'blue'
  | 'neutral'
  | 'assassin';

export type TajniAgentiPhase =
  | 'team-selection'
  | 'clue-giving'
  | 'guessing'
  | 'turn-results'
  | 'ended';

/**
 * Public card view sent to host + all controllers (including guessers).
 * The `type` field is only present for cards that have been revealed;
 * unrevealed cards expose only `id` + `word` so the secret board cannot
 * be leaked through inspector tools.
 */
export interface TajniAgentiPublicCard {
  id: number;
  word: string;
  revealed: boolean;
  type?: TajniAgentiCardType;
}

/**
 * Full card view — only sent inside `playerData[playerId]` for the two
 * spymasters so they can render the colour-keyed board on their phone.
 */
export interface TajniAgentiSecretCard {
  id: number;
  word: string;
  type: TajniAgentiCardType;
  revealed: boolean;
}

export interface TajniAgentiClue {
  word: string;
  count: number;
  team: TajniAgentiTeam;
}

export interface TajniAgentiTeamRoster {
  playerIds: string[];
  spymasterId: string | null;
}

export interface TajniAgentiPublicRosters {
  red: TajniAgentiTeamRoster;
  blue: TajniAgentiTeamRoster;
  unassignedPlayerIds: string[];
  readyToStart: boolean;
  rosterIssue: string | null;
}

export interface TajniAgentiTurnLogEntry {
  cardId: number;
  word: string;
  revealedType: TajniAgentiCardType;
  guesserId: string;
  guesserName: string;
}

export interface TajniAgentiTurnResultsData {
  team: TajniAgentiTeam;
  clue: TajniAgentiClue | null;
  log: TajniAgentiTurnLogEntry[];
  endReason: 'wrong-team' | 'neutral' | 'assassin' | 'count-reached' | 'ended-early' | 'timeout';
  nextTeam: TajniAgentiTeam | null;
}

export interface TajniAgentiEndedData {
  winner: TajniAgentiTeam;
  reason: 'all-found' | 'assassin' | 'opponent-finished';
  redRemaining: number;
  blueRemaining: number;
}
