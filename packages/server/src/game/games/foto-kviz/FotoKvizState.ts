import type {
  CustomFotoKvizSubmission,
  FotoKvizFullQuestion,
  FotoKvizMode,
  FotoKvizPhase,
} from '@igra/shared';

// Phase durations (seconds).
export const INTRO_DURATION = 3;
export const SHOWING_PHOTO_DURATION = 3;
export const ANSWERING_DURATION = 15;
export const SHOWING_RESULTS_DURATION = 5;
export const FINAL_LEADERBOARD_DURATION = 8;

// Submission phase has no real timer; large finite value avoids special-casing.
export const SUBMISSION_DURATION = 60 * 30;

export const MAX_ROUNDS = 8;
export const MIN_LOCATIONS = 2;
export const MAX_OPTIONS = 4;

// Custom-mode photos per player.
export const MIN_PHOTOS_PER_PLAYER = 1;
export const MAX_PHOTOS_PER_PLAYER = 4;
export const DEFAULT_PHOTOS_PER_PLAYER = 2;

export const MIN_CAPTION_LENGTH = 2;
export const MAX_CAPTION_LENGTH = 80;
export const MAX_BASE64_BYTES = 700_000;

export interface FotoKvizPlayerAnswer {
  optionIndex: number;
  timeMs: number;
  correct: boolean;
  pointsAwarded: number;
}

export interface FotoKvizInternalState {
  phase: FotoKvizPhase;
  phaseTimeRemaining: number;
  mode: FotoKvizMode;
  packName?: string;

  /** Final list of round questions (with correct answers). */
  questions: FotoKvizFullQuestion[];
  currentQuestionIndex: number;
  totalRounds: number;

  /** Current round's per-player answers. */
  answers: Map<string, FotoKvizPlayerAnswer>;
  questionStartTime: number;

  /** Cumulative score across rounds, mirrored to player.score on tally. */
  totalScores: Map<string, number>;

  /** Custom-mode submissions, alive for the duration of one game. */
  customSubmissions: Map<string, CustomFotoKvizSubmission[]>;
  customPhotosPerPlayer: number;

  /** Custom-mode roster — players eligible to submit at submission start. */
  submissionRoster: string[];
}
