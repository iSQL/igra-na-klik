import type { GeoPackMapDef, GeoPin } from './geo-guess.js';

export interface QuizOption {
  index: number;
  text: string;
  color: string;
}

/**
 * Per-question type discriminator for the unified Kviz:
 *  - 'obicno' — classic multiple choice (optionally with an image).
 *  - 'audio'  — an audio clip plays, then multiple choice.
 *  - 'video'  — a YouTube embed plays, then multiple choice.
 *  - 'geo'    — pin-on-map guess (photo + map, distance scoring).
 *  - 'broj'   — slider number guess (closeness × speed scoring).
 */
export type KvizQuestionType = 'obicno' | 'geo' | 'broj' | 'audio' | 'video';

/** How a numeric value is rendered on screen. `duration` shows mm:ss. */
export type KvizValueType = 'number' | 'duration';

export interface KvizVideoRef {
  /** YouTube video id (11 chars). */
  videoId: string;
  startSeconds?: number;
  endSeconds?: number;
}

/**
 * Choice-style question (obicno/audio/video) — client-safe shape, no answer.
 * `imageUrl`/`audioUrl` are part of the prompt and always safe to broadcast:
 * server-hosted paths (`/quiz-images/...`, `/kviz-files/...`), remote http(s)
 * URLs, or (images only) small inline `data:image/...` URLs.
 */
export interface KvizChoiceQuestion {
  type: 'obicno' | 'audio' | 'video';
  id: string;
  text: string;
  imageUrl?: string;
  /** audio only. */
  audioUrl?: string;
  /** video only. */
  video?: KvizVideoRef;
  options: QuizOption[];
  timeLimit: number;
}

/** Pin-on-map question — client-safe shape; lat/lng stay server-side. */
export interface KvizGeoQuestion {
  type: 'geo';
  id: string;
  /** Prompt text (default "Gde je ovo slikano?"). */
  text: string;
  imageUrl: string;
  caption?: string;
  /**
   * Custom map image for this question, if any. Undefined = bundled Serbia
   * map. Clients render this image and measure its aspect ratio on load;
   * pins stay normalized [0, 1] regardless.
   */
  mapImageUrl?: string;
  timeLimit: number;
}

/** Slider number-guess question — client-safe shape; answer stays server-side. */
export interface KvizBrojQuestion {
  type: 'broj';
  id: string;
  text: string;
  imageUrl?: string;
  emoji?: string;
  /** Slider lower bound. */
  min: number;
  /** Slider upper bound. */
  max: number;
  /** Slider step (default 1). */
  step?: number;
  /** Unit suffix shown next to the number: "din", "kg", "km", "god."… */
  unit?: string;
  /** `duration` formats the value as mm:ss (answer in seconds). */
  valueType?: KvizValueType;
  timeLimit: number;
}

export type KvizQuestion = KvizChoiceQuestion | KvizGeoQuestion | KvizBrojQuestion;

/** Full questions with answers — only used server-side and in results. */
export type KvizChoiceQuestionFull = KvizChoiceQuestion & { correctIndex: number };
export type KvizGeoQuestionFull = KvizGeoQuestion & {
  lat: number;
  lng: number;
  /** Custom map definition (mercator bbox) — drives pin↔latlng projection. */
  map?: GeoPackMapDef;
};
export type KvizBrojQuestionFull = KvizBrojQuestion & { answer: number };
export type KvizQuestionFull =
  | KvizChoiceQuestionFull
  | KvizGeoQuestionFull
  | KvizBrojQuestionFull;

/** Legacy aliases — the choice shape is what the original quiz always was. */
export type QuizQuestion = KvizChoiceQuestion;
export type QuizQuestionFull = KvizChoiceQuestionFull;

export interface QuizResultAnswer {
  playerId: string;
  optionIndex: number;
  timeMs: number;
  correct: boolean;
}

/** showing-results payload for choice questions (obicno/audio/video). */
export interface QuizResultData {
  question: KvizChoiceQuestion & { correctIndex: number };
  answers: QuizResultAnswer[];
  scores: { playerId: string; roundScore: number; totalScore: number }[];
}

/** showing-results payload for geo questions. */
export interface KvizGeoRoundResultEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  pin: GeoPin | null;
  distanceKm: number | null;
  roundScore: number;
  totalScore: number;
}

export interface KvizGeoRoundResult {
  imageUrl: string;
  caption?: string;
  lat: number;
  lng: number;
  /** Projected from the truth's lat/lng for drawing the gold pin. */
  truePin: GeoPin;
  mapImageUrl?: string;
  /** Sorted by roundScore desc. */
  results: KvizGeoRoundResultEntry[];
}

/** showing-results payload for broj questions. */
export interface KvizBrojRoundResultEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  guess: number | null;
  distance: number | null;
  roundScore: number;
  totalScore: number;
}

export interface KvizBrojRoundResult {
  trueValue: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  valueType?: KvizValueType;
  /** Sorted by roundScore desc. */
  results: KvizBrojRoundResultEntry[];
}

export interface QuizLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export const QUIZ_OPTION_COLORS = [
  '#C75146',
  '#6FC2BB',
  '#E3B45E',
  '#7C5FA8',
] as const;
