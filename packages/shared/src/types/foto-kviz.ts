/**
 * Wire types for "Foto kviz" — multiple-choice variant of Pogodi gde je.
 *
 * Players see a photo and 4 caption-derived options; they tap the one that
 * names where the photo is from. Correct answer = location's `caption`,
 * distractors = 3 other captions from the same pack (predefined) or from
 * other players' submissions (custom). Speed-based scoring like the Quiz.
 *
 * Shares geo-pack infrastructure (server endpoint + image hosting) with the
 * existing geo-pogodi game; nothing in the manifest schema changes.
 */

import type { QuizOption } from './quiz.js';
import type {
  GeoLeaderboardEntry,
  GeoSubmissionProgress,
} from './geo-guess.js';

export type FotoKvizPhase =
  | 'submission'
  | 'intro'
  | 'showing-photo'
  | 'answering'
  | 'showing-results'
  | 'final-leaderboard'
  | 'ended';

export type FotoKvizMode = 'predefined' | 'custom';

/** Public, client-safe question — `correctIndex` is server-only until reveal. */
export interface FotoKvizPublicQuestion {
  id: string;
  imageUrl: string;
  options: QuizOption[];
  timeLimit: number;
  /** Player id of the photo's uploader in custom mode (so they can sit out). */
  contributedBy?: string;
}

/** Server-only — extends public with the answer. */
export interface FotoKvizFullQuestion extends FotoKvizPublicQuestion {
  correctIndex: number;
}

export interface FotoKvizPlayerAnswerSummary {
  playerId: string;
  name: string;
  avatarColor: string;
  optionIndex: number | null;
  correct: boolean;
  pointsAwarded: number;
}

export interface FotoKvizRoundResult {
  question: FotoKvizPublicQuestion & { correctIndex: number };
  perPlayer: FotoKvizPlayerAnswerSummary[];
}

export interface FotoKvizHostData {
  mode: FotoKvizMode;
  packName?: string;
  totalRounds: number;
  // submission
  submissionProgress?: GeoSubmissionProgress[];
  customPhotosPerPlayer?: number;
  submissionPending?: number;
  // showing-photo / answering / showing-results
  currentRound?: {
    index: number;
    total: number;
    question: FotoKvizPublicQuestion;
  };
  // answering
  answeredCount?: number;
  totalPlayers?: number;
  // showing-results
  roundResult?: FotoKvizRoundResult;
  // final-leaderboard
  finalLeaderboard?: GeoLeaderboardEntry[];
}

export type FotoKvizControllerRole = 'submitter' | 'guesser' | 'spectator';

export interface FotoKvizControllerData {
  role: FotoKvizControllerRole;
  mode: FotoKvizMode;
  // submission
  photosNeeded?: number;
  photosSubmitted?: number;
  // answering
  hasAnswered?: boolean;
  selectedIndex?: number;
  /** True iff the current round shows this player's own uploaded photo. */
  isOwnPhoto?: boolean;
  // showing-results
  ownCorrect?: boolean;
  ownPoints?: number;
  /** Correct answer text — sent to all players in showing-results. */
  correctOptionText?: string;
  // shared
  totalScore?: number;
}

/** Wire shape the controller sends for `foto:add-photo` in the submission phase. */
export interface CustomFotoKvizSubmission {
  imageBase64: string;
  caption: string;
}
