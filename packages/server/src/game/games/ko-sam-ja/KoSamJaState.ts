import type { KoSamJaCategory, KoSamJaShape } from '@igra/shared';

export type KoSamJaPhase =
  | 'collecting-upfront'
  | 'showing-question'
  | 'subject-picking'
  | 'guessing'
  | 'showing-results'
  | 'leaderboard'
  | 'ended';

export interface KoSamJaQuestion {
  id: string;
  shape: KoSamJaShape;
  category: KoSamJaCategory;
  text: string;
  options?: string[];
  maxLength?: number;
  /** pickN only — per-peer template, defaults to bare peer name. */
  optionTemplate?: string;
  /** pickN only — cap on co-players shown as buttons. */
  maxPeers?: number;
  /** pickN only — literal non-peer buttons mixed in. */
  extraOptions?: string[];
}

export interface KoSamJaSelectedRound {
  questionId: string;
  subjectPlayerId: string;
}

export interface KoSamJaUpfrontAnswer {
  optionIndex?: number;
  text?: string;
}

export interface KoSamJaInternalState {
  category: KoSamJaCategory;
  questionPool: KoSamJaQuestion[];
  selectedRounds: KoSamJaSelectedRound[];
  currentRoundIndex: number;

  phase: KoSamJaPhase;
  phaseTimeRemaining: number;

  upfrontAnswers: Map<string, Map<string, KoSamJaUpfrontAnswer>>;
  upfrontAssignments: Map<string, string[]>;

  roundQuestionStartTime: number;
  roundOptions: { id: string; text: string }[];
  roundPeerOptionPlayerIds: string[] | null;
  roundCorrectOptionId: string | null;
  roundGuesses: Map<string, { optionId: string; timeMs: number }>;
  roundSubjectSkipped: boolean;

  roundScores: Map<string, number>;
  roundWrongGuessCount: number;
  roundSubjectBonus: number;

  /**
   * Snapshot of player IDs (excluding the subject) who were connected
   * when the current `guessing` phase began. Drives early-exit so a brief
   * mid-round disconnect doesn't shrink the "everyone guessed"
   * denominator. Pruned via onPlayerDisconnect when grace expires.
   */
  expectedGuesserIds: Set<string>;
}

export const COLLECTING_UPFRONT_DURATION = 120;
export const SHOWING_QUESTION_DURATION = 4;
export const SUBJECT_PICKING_DURATION = 15;
export const GUESSING_DURATION = 15;
// Reveal + standings are shown together on one screen, so this spans what
// used to be SHOWING_RESULTS_DURATION (6) + the old LEADERBOARD_DURATION (4).
export const SHOWING_RESULTS_DURATION = 10;
export const LEADERBOARD_DURATION = 4;
export const NUM_ROUNDS = 8;
export const SUBJECT_BONUS_PER_WRONG = 200;
