export type TajniAgentiTeam = 'red' | 'blue';

/**
 * Game mode, chosen on the game-select screen before start:
 * - `classic` — two competing teams, each with a spymaster (min 4 players).
 * - `duet` — cooperative Codenames: Duet. Two sides, each sees its own
 *   secret key (9 agents, 3 assassins, 13 bystanders per side; 15 distinct
 *   agents total). Sides alternate giving clues to each other and share a
 *   budget of 9 turns to find all 15 agents. Min 2 players (1 per side).
 * - `coop` — one spymaster + guessers vs the board. Standard 25-card board;
 *   find all 9 agents before the shared pool of 9 points runs out. Every
 *   turn costs 1 point; revealing an enemy-coloured card costs 1 extra.
 *   Min 2 players.
 */
export type TajniAgentiMode = 'classic' | 'duet' | 'coop';

export type TajniAgentiCardType =
  | 'red'
  | 'blue'
  | 'neutral'
  | 'assassin'
  /** Duet only — a found agent (green). */
  | 'agent';

/** Duet: what a card means on one side of the double key. */
export type TajniAgentiDuetSideType = 'agent' | 'neutral' | 'assassin';

/** Duet: the double-sided key for a single card. */
export interface TajniAgentiDuetKey {
  red: TajniAgentiDuetSideType;
  blue: TajniAgentiDuetSideType;
}

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
  /**
   * Duet only — sides against whose key this card was revealed as a
   * bystander. The card stays unrevealed (it may still be an agent on the
   * other side) but cannot be guessed again against the same side's clue.
   */
  bystanderFor?: TajniAgentiTeam[];
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
  /** Duet only — the double-sided key (server-internal; per-player views
   * are projected to that player's own side). */
  duet?: TajniAgentiDuetKey;
  /** Duet only — see TajniAgentiPublicCard.bystanderFor. */
  bystanderFor?: TajniAgentiTeam[];
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
  /**
   * Set when this turn ends the game. Classic: the winning team. Coop
   * modes (duet/coop): 'players' on a win, null on a loss.
   */
  winner?: TajniAgentiTeam | 'players' | null;
  /** Duet/coop — turns (duet) or points (coop) left after this turn. */
  turnsRemaining?: number;
}

export type TajniAgentiEndReason =
  | 'all-found'
  | 'assassin'
  | 'opponent-finished'
  /** Duet/coop — the shared budget of 9 turns/points ran out. */
  | 'out-of-turns'
  /** Duet/coop — too few players left to continue. */
  | 'abandoned';

export interface TajniAgentiEndedData {
  /** Classic: the winning team. Duet/coop: 'players' on a win, null on a loss. */
  winner: TajniAgentiTeam | 'players' | null;
  reason: TajniAgentiEndReason;
  redRemaining: number;
  blueRemaining: number;
  /** Duet — agents found / total (15). Coop — found / total (9). */
  agentsFound?: number;
  agentsTotal?: number;
}
