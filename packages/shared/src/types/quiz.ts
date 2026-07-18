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
 *  - 'emoji'  — emoji string riddle, free-text answer (speed scoring,
 *               progressive letter hints — absorbed "Emoji zagonetke").
 *  - 'uljez'  — odd-one-out: 4 pojma, 3 spadaju zajedno, 1 je uljez —
 *               players tap the uljez (choice mechanics, correctIndex = uljez).
 *  - 'dopuna' — finish the quote/lyric: the visible part shows with a blank,
 *               players type the missing word (fuzzy-matched free text).
 *  - 'piksel' — pixelated image that de-pixelates over the round; players
 *               race to type what it shows (fuzzy-matched free text).
 *  - 'anagram'— scrambled letters slowly rearrange into the answer on the TV;
 *               players type the word (speed scoring = points decay).
 *  - 'redosled' — order 3–10 items (chronology, size, steps…); scored by
 *               pairwise correctness of the submitted arrangement.
 */
export type KvizQuestionType =
  | 'obicno'
  | 'geo'
  | 'broj'
  | 'audio'
  | 'video'
  | 'emoji'
  | 'uljez'
  | 'dopuna'
  | 'piksel'
  | 'anagram'
  | 'redosled';

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
  type: 'obicno' | 'audio' | 'video' | 'uljez';
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

/**
 * Emoji riddle question — client-safe shape; the answer + accept list stay
 * server-side. Players type free text; `hint` (progressive letter reveal) is
 * public and rides in the shared host data, not here.
 */
export interface KvizEmojiQuestion {
  type: 'emoji';
  id: string;
  /** Prompt text (default "Šta se krije iza emojija?"). */
  text: string;
  /** The emoji string that IS the riddle. */
  emojis: string;
  timeLimit: number;
}

/**
 * "Završi citat" question — client-safe shape; the missing word(s) stay
 * server-side. The visible part of the quote renders with a blank appended.
 */
export interface KvizDopunaQuestion {
  type: 'dopuna';
  id: string;
  /** Prompt text (default "Završi citat!"). */
  text: string;
  /** The visible part of the quote — the hidden word(s) come after it. */
  quote: string;
  timeLimit: number;
}

/**
 * Pixelated-image question — client-safe shape; the answer stays server-side.
 * Clients render the image pixelated and sharpen it as time runs out
 * (pixelation is derived from timeRemaining/timeLimit — no extra state).
 */
export interface KvizPikselQuestion {
  type: 'piksel';
  id: string;
  /** Prompt text (default "Šta je na slici?"). */
  text: string;
  imageUrl: string;
  timeLimit: number;
}

/**
 * Anagram question — client-safe shape; the answer stays server-side. The
 * public, progressively-unscrambling letters ride the shared host data as
 * `data.scramble`, never here.
 */
export interface KvizAnagramQuestion {
  type: 'anagram';
  id: string;
  /** Prompt/category text (default "Reši anagram!"). */
  text: string;
  timeLimit: number;
}

/**
 * Ordering question — client-safe shape. `items` is the SHUFFLED presentation
 * order (same for every player); the correct ranking stays server-side.
 */
export interface KvizRedosledQuestion {
  type: 'redosled';
  id: string;
  text: string;
  items: string[];
  timeLimit: number;
}

export type KvizQuestion =
  | KvizChoiceQuestion
  | KvizGeoQuestion
  | KvizBrojQuestion
  | KvizEmojiQuestion
  | KvizDopunaQuestion
  | KvizPikselQuestion
  | KvizAnagramQuestion
  | KvizRedosledQuestion;

/** Full questions with answers — only used server-side and in results. */
export type KvizChoiceQuestionFull = KvizChoiceQuestion & { correctIndex: number };
export type KvizGeoQuestionFull = KvizGeoQuestion & {
  lat: number;
  lng: number;
  /** Custom map definition (mercator bbox) — drives pin↔latlng projection. */
  map?: GeoPackMapDef;
};
export type KvizBrojQuestionFull = KvizBrojQuestion & { answer: number };
export type KvizEmojiQuestionFull = KvizEmojiQuestion & {
  answer: string;
  accept?: string[];
};
export type KvizDopunaQuestionFull = KvizDopunaQuestion & {
  answer: string;
  accept?: string[];
};
export type KvizPikselQuestionFull = KvizPikselQuestion & {
  answer: string;
  accept?: string[];
};
export type KvizAnagramQuestionFull = KvizAnagramQuestion & {
  answer: string;
  accept?: string[];
};
export type KvizRedosledQuestionFull = KvizRedosledQuestion & {
  /** For presented items[i], its rank (0-based) in the correct sequence. */
  order: number[];
};
export type KvizQuestionFull =
  | KvizChoiceQuestionFull
  | KvizGeoQuestionFull
  | KvizBrojQuestionFull
  | KvizEmojiQuestionFull
  | KvizDopunaQuestionFull
  | KvizPikselQuestionFull
  | KvizAnagramQuestionFull
  | KvizRedosledQuestionFull;

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

/** showing-results payload for emoji questions. */
export interface KvizEmojiRoundResultEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  solved: boolean;
  timeMs: number | null;
  roundScore: number;
  totalScore: number;
}

export interface KvizEmojiRoundResult {
  emojis: string;
  answer: string;
  /** Sorted by roundScore desc. */
  results: KvizEmojiRoundResultEntry[];
}

/**
 * showing-results payload for the free-text types dopuna/piksel/anagram —
 * same per-player entries as emoji, plus the prompt visual for the reveal.
 */
export interface KvizTextRoundResult {
  kind: 'dopuna' | 'piksel' | 'anagram';
  answer: string;
  /** dopuna: the visible part of the quote. */
  quote?: string;
  /** piksel: the (now sharp) image. */
  imageUrl?: string;
  /** Sorted by roundScore desc. */
  results: KvizEmojiRoundResultEntry[];
}

/** showing-results payload for redosled questions. */
export interface KvizRedosledRoundResultEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  /** Player's submitted arrangement as indices into the PRESENTED items. */
  arrangement: number[] | null;
  /** Share of correctly-ordered pairs, 0–100 (null = no submission). */
  accuracy: number | null;
  roundScore: number;
  totalScore: number;
}

export interface KvizRedosledRoundResult {
  text: string;
  /** Items in the CORRECT order (the reveal). */
  correctItems: string[];
  /** Items in the presented (shuffled) order — for rendering arrangements. */
  presentedItems: string[];
  /** Sorted by roundScore desc. */
  results: KvizRedosledRoundResultEntry[];
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
