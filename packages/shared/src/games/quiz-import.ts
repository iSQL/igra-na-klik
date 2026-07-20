import { QUIZ_OPTION_COLORS, KVIZ_QUESTION_TAGS } from '../types/quiz.js';
import type {
  KvizQuestionType,
  KvizQuestionTag,
  KvizValueType,
  QuizOption,
} from '../types/quiz.js';
import type { GeoMapBBox, GeoPackMapDef } from '../types/geo-guess.js';
import { KVIZ_CATEGORY_IDS } from './quiz-categories.js';
import type { KvizCategoryId } from './quiz-categories.js';

/**
 * Human-friendly wire formats for kviz pack questions. A pack manifest is
 * `{ name?, description?, maps?, questions }`; a bare JSON array of questions
 * is also accepted for back-compat (treated as all-'obicno').
 *
 * `type` omitted ⇒ 'obicno'. File-based fields (`imageFile`, `audioFile`,
 * `mapId`) are only legal in 'pack' context — they resolve against the pack's
 * sibling asset folder. Inline imports (host file upload) must use URLs.
 */
export interface KvizImportChoiceBase {
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit?: number;
}

export interface KvizImportObicno extends KvizImportChoiceBase {
  type?: 'obicno';
  imageUrl?: string;
  imageFile?: string;
}

export interface KvizImportAudio extends KvizImportChoiceBase {
  type: 'audio';
  audioFile?: string;
  audioUrl?: string;
  imageUrl?: string;
  imageFile?: string;
}

export interface KvizImportVideo extends KvizImportChoiceBase {
  type: 'video';
  videoId: string;
  startSeconds?: number;
  endSeconds?: number;
}

export interface KvizImportGeo {
  type: 'geo';
  /** Prompt text; defaults to "Gde je ovo slikano?". */
  text?: string;
  imageFile?: string;
  imageUrl?: string;
  caption?: string;
  lat: number;
  lng: number;
  /** References an entry in the manifest's `maps`; absent = Serbia map. */
  mapId?: string;
  timeLimit?: number;
}

export interface KvizImportBroj {
  type: 'broj';
  text: string;
  answer: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  valueType?: KvizValueType;
  emoji?: string;
  imageFile?: string;
  imageUrl?: string;
  timeLimit?: number;
}

export interface KvizImportEmoji {
  type: 'emoji';
  /** Prompt text; defaults to KVIZ_EMOJI_DEFAULT_TEXT. */
  text?: string;
  emojis: string;
  answer: string;
  /** Accepted alternate answers (fuzzy-matched like the main answer). */
  accept?: string[];
  /**
   * Short answer-category hint shown to players (e.g. "Film", "Crtani lik",
   * "Lokacija", "Situacija"). Purely a display aid — never affects matching.
   */
  category?: string;
  timeLimit?: number;
}

export interface KvizImportUljez extends KvizImportChoiceBase {
  type: 'uljez';
  /** Exactly 4 pojma; correctIndex marks the uljez. Optional prompt text. */
  imageUrl?: string;
  imageFile?: string;
}

export interface KvizImportDopuna {
  type: 'dopuna';
  /** Prompt text; defaults to KVIZ_DOPUNA_DEFAULT_TEXT. */
  text?: string;
  /** Visible part of the quote (the hidden word(s) come after it). */
  quote: string;
  /** The missing word(s) players must type. */
  answer: string;
  /** Accepted alternates (fuzzy-matched like the main answer). */
  accept?: string[];
  timeLimit?: number;
}

export interface KvizImportPiksel {
  type: 'piksel';
  /** Prompt text; defaults to KVIZ_PIKSEL_DEFAULT_TEXT. */
  text?: string;
  imageFile?: string;
  imageUrl?: string;
  answer: string;
  accept?: string[];
  timeLimit?: number;
}

export interface KvizImportAnagram {
  type: 'anagram';
  /** Prompt/category text; defaults to KVIZ_ANAGRAM_DEFAULT_TEXT. */
  text?: string;
  answer: string;
  accept?: string[];
  timeLimit?: number;
}

export interface KvizImportRedosled {
  type: 'redosled';
  text: string;
  /** 3–10 items in the CORRECT order (shuffled at runtime for play). */
  items: string[];
  timeLimit?: number;
}

export interface KvizImportDominoItem {
  label: string;
  value: number;
}

export interface KvizImportDomino {
  type: 'domino';
  /** Prompt text; defaults to KVIZ_DOMINO_DEFAULT_TEXT. */
  text?: string;
  /** 3–12 items in presented order; each has a comparable numeric `value`. */
  items: KvizImportDominoItem[];
  /** Button labels; default "Pre"/"Posle" (lower/higher value). */
  lowerLabel?: string;
  higherLabel?: string;
  unit?: string;
  valueType?: KvizValueType;
  timeLimit?: number;
}

export interface KvizImportMatrica {
  type: 'matrica';
  /** Prompt text; defaults to KVIZ_MATRICA_DEFAULT_TEXT. */
  text?: string;
  /** Exactly 9 grid terms (3×3), row-major. */
  cells: string[];
  /** The 3 indices (0–8) of the connected triple. */
  correct: number[];
  /** Optional reveal note explaining the link. */
  explanation?: string;
  timeLimit?: number;
}

/**
 * Metadata common to every question shape. `tags` are author-only (difficulty
 * / NSFW) and never reach players — see {@link KvizQuestionTag}.
 */
export interface KvizImportQuestionMeta {
  tags?: KvizQuestionTag[];
}

export type KvizImportQuestion = (
  | KvizImportObicno
  | KvizImportAudio
  | KvizImportVideo
  | KvizImportGeo
  | KvizImportBroj
  | KvizImportEmoji
  | KvizImportUljez
  | KvizImportDopuna
  | KvizImportPiksel
  | KvizImportAnagram
  | KvizImportRedosled
  | KvizImportDomino
  | KvizImportMatrica
) &
  KvizImportQuestionMeta;

export interface KvizPackManifest {
  name?: string;
  description?: string;
  /** Grouping category id (see KVIZ_CATEGORIES); unknown/missing = 'ostalo'. */
  category?: KvizCategoryId;
  maps?: Record<string, GeoPackMapDef>;
  questions: KvizImportQuestion[];
}

export interface QuizParseOptions {
  /** Admin drafts may be empty; game-side callers stay strict. */
  allowEmpty?: boolean;
  /** 'pack' = file refs + mapId legal; 'inline' = URLs only. */
  context: 'pack' | 'inline';
}

export type QuizImportResult =
  | { ok: true; manifest: KvizPackManifest }
  | { ok: false; error: string };

/** Per-type default answering time (seconds). */
export const KVIZ_DEFAULT_TIME_LIMIT: Record<KvizQuestionType, number> = {
  obicno: 15,
  audio: 15,
  video: 15,
  geo: 30,
  broj: 25,
  emoji: 20,
  uljez: 15,
  dopuna: 20,
  piksel: 25,
  anagram: 25,
  redosled: 35,
  domino: 35,
  matrica: 30,
};

const MIN_TIME_LIMIT = 5;
const MAX_TIME_LIMIT = 60;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = QUIZ_OPTION_COLORS.length; // 4
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 100;
const MAX_TEXT_LENGTH = 200;
const MAX_CAPTION_LENGTH = 200;
const MAX_UNIT_LENGTH = 20;
const MAX_EMOJI_LENGTH = 8;
// Cap the image field so a rogue data: URL can't blow past the 512 KB socket
// message limit on host:start-game. Server-hosted images are short paths;
// small inline data URLs still fit comfortably under this.
const MAX_IMAGE_URL_LENGTH = 400_000;
const MAX_AUDIO_URL_LENGTH = 2_000;
const VALUE_TYPES = new Set<KvizValueType>(['number', 'duration']);
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const MAP_ID_RE = /^[a-z0-9-]{1,40}$/;
const AUDIO_EXT_RE = /\.(mp3|ogg|m4a)$/i;

// Serbia bounds — geo questions without a custom map must land on the
// bundled Serbia map (same constants the old geo packs used).
const SERBIA_MIN_LAT = 41.5;
const SERBIA_MAX_LAT = 46.5;
const SERBIA_MIN_LNG = 18.5;
const SERBIA_MAX_LNG = 23.5;

export const KVIZ_GEO_DEFAULT_TEXT = 'Gde je ovo slikano?';
export const KVIZ_EMOJI_DEFAULT_TEXT = 'Šta se krije iza emojija?';
export const KVIZ_ULJEZ_DEFAULT_TEXT = 'Pronađi uljeza!';
export const KVIZ_DOPUNA_DEFAULT_TEXT = 'Završi citat!';
export const KVIZ_PIKSEL_DEFAULT_TEXT = 'Šta je na slici?';
export const KVIZ_ANAGRAM_DEFAULT_TEXT = 'Reši anagram!';
export const KVIZ_DOMINO_DEFAULT_TEXT = 'Pre ili posle?';
export const KVIZ_MATRICA_DEFAULT_TEXT = 'Poveži 3 pojma koja idu zajedno!';
export const KVIZ_DOMINO_DEFAULT_LOWER = 'Pre';
export const KVIZ_DOMINO_DEFAULT_HIGHER = 'Posle';

/**
 * Pseudo pack id representing the built-in question bank in the pack
 * multi-select (quizPackIds) — clients render it as a regular list item,
 * the server maps it to QUIZ_QUESTION_BANK.
 */
export const KVIZ_BANK_PACK_ID = '__bank__';

// Emoji riddle limits (carried over from the absorbed "Emoji zagonetke").
const MAX_EMOJIS_LENGTH = 40;
const MAX_EMOJI_ANSWER_LENGTH = 60;
const MAX_EMOJI_ACCEPT = 8;
const MAX_EMOJI_CATEGORY_LENGTH = 40;

/**
 * Normalize a free-text answer for comparison: lowercase, fold Serbian
 * diacritics, drop punctuation and collapse whitespace, so
 * "Kralj Lavova!" == "kralj lavova". Used by emoji questions.
 */
export function normalizeEmojiAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents (c-caron etc.)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True if `guess` matches the riddle's answer or any accepted alternate. */
export function checkEmojiGuess(
  guess: string,
  riddle: { answer: string; accept?: string[] }
): boolean {
  const g = normalizeEmojiAnswer(guess);
  if (!g) return false;
  if (g === normalizeEmojiAnswer(riddle.answer)) return true;
  return (riddle.accept ?? []).some((a) => normalizeEmojiAnswer(a) === g);
}

/**
 * Damerau-Levenshtein (optimal string alignment) distance with an early-out
 * cap — adjacent-letter swaps ("beogard") count as ONE edit, the most common
 * phone typo.
 */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev2: number[] | null = null;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (
        prev2 &&
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d = Math.min(d, prev2[j - 2] + 1);
      }
      curr[j] = d;
      if (d < rowMin) rowMin = d;
    }
    if (rowMin > cap) return cap + 1;
    prev2 = prev;
    prev = curr;
    curr = new Array<number>(b.length + 1);
  }
  return prev[b.length];
}

/** Typo tolerance by target length: 0 for short words, 1 from 5, 2 from 10. */
function typoToleranceFor(target: string): number {
  if (target.length >= 10) return 2;
  if (target.length >= 5) return 1;
  return 0;
}

/**
 * Free-text answer check for dopuna/piksel/anagram questions: same
 * normalization as emoji answers, plus small-typo tolerance (Levenshtein)
 * so "beogard" still counts for "beograd".
 */
export function checkTextGuess(
  guess: string,
  q: { answer: string; accept?: string[] }
): boolean {
  const g = normalizeEmojiAnswer(guess);
  if (!g) return false;
  const targets = [q.answer, ...(q.accept ?? [])].map(normalizeEmojiAnswer);
  return targets.some((t) => {
    if (!t) return false;
    if (t === g) return true;
    const cap = typoToleranceFor(t);
    return cap > 0 && editDistance(g, t, cap) <= cap;
  });
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

const KVIZ_TAG_SET = new Set<string>(KVIZ_QUESTION_TAGS);

/**
 * Lax parse of a question's author tags: keep known tag ids, drop anything
 * else (never a validation error). Returns undefined when there are none.
 */
function parseQuestionTags(raw: unknown): KvizQuestionTag[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: KvizQuestionTag[] = [];
  for (const t of raw) {
    if (typeof t === 'string' && KVIZ_TAG_SET.has(t) && !out.includes(t as KvizQuestionTag)) {
      out.push(t as KvizQuestionTag);
    }
  }
  return out.length > 0 ? out : undefined;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Validate a pack-relative asset filename (no path traversal). */
function parsePackFile(
  raw: unknown,
  label: string,
  field: string
): { ok: true; file?: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true };
  if (!isNonEmptyString(raw)) {
    return { ok: false, error: `${label}: "${field}" mora biti string.` };
  }
  const file = raw.trim();
  if (file.includes('..') || file.includes('/') || file.includes('\\')) {
    return { ok: false, error: `${label}: nevažeća putanja fajla u "${field}".` };
  }
  return { ok: true, file };
}

/** Validate the optional per-question image URL/path. */
function parseImageUrl(
  raw: unknown,
  label: string
): { ok: true; imageUrl?: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true };
  if (typeof raw !== 'string')
    return { ok: false, error: `${label}: imageUrl mora biti tekst.` };
  const url = raw.trim();
  if (url.length === 0) return { ok: true };
  if (url.length > MAX_IMAGE_URL_LENGTH)
    return { ok: false, error: `${label}: slika je prevelika.` };
  const allowed =
    url.startsWith('/quiz-images/') ||
    url.startsWith('/kviz-files/') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:image/');
  if (!allowed)
    return {
      ok: false,
      error: `${label}: imageUrl mora biti putanja (/quiz-images/…), http(s) URL ili data:image URL.`,
    };
  return { ok: true, imageUrl: url };
}

// Custom-map bbox sanity limits: must sit on the (mercator-safe) globe and
// span something real but not continental — these maps are city/region scale.
const BBOX_ABS_LAT = 85;
const MAX_BBOX_SPAN_DEG = 20;
const MIN_BBOX_SPAN_DEG = 0.001;

function parseMapDef(
  raw: unknown,
  label: string
): { ok: true; map: GeoPackMapDef } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: `${label}: mapa mora biti objekat.` };
  }
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.imageFile)) {
    return { ok: false, error: `${label}: nedostaje "imageFile".` };
  }
  const imageFile = (obj.imageFile as string).trim();
  if (
    imageFile.includes('..') ||
    imageFile.includes('/') ||
    imageFile.includes('\\')
  ) {
    return { ok: false, error: `${label}: nevažeća putanja slike mape.` };
  }
  const bboxRaw = obj.bbox as Record<string, unknown> | undefined;
  if (!bboxRaw || typeof bboxRaw !== 'object') {
    return { ok: false, error: `${label}: nedostaje "bbox".` };
  }
  const nums: Partial<GeoMapBBox> = {};
  for (const key of ['minLat', 'maxLat', 'minLng', 'maxLng'] as const) {
    if (!isFiniteNumber(bboxRaw[key])) {
      return { ok: false, error: `${label}: "bbox" — nedostaje broj "${key}".` };
    }
    nums[key] = bboxRaw[key] as number;
  }
  const bbox = nums as GeoMapBBox;
  if (Math.abs(bbox.minLat) > BBOX_ABS_LAT || Math.abs(bbox.maxLat) > BBOX_ABS_LAT) {
    return {
      ok: false,
      error: `${label}: "bbox" — lat mora biti između -${BBOX_ABS_LAT} i ${BBOX_ABS_LAT}.`,
    };
  }
  if (bbox.minLng < -180 || bbox.maxLng > 180) {
    return { ok: false, error: `${label}: "bbox" — lng mora biti između -180 i 180.` };
  }
  const latSpan = bbox.maxLat - bbox.minLat;
  const lngSpan = bbox.maxLng - bbox.minLng;
  if (latSpan < MIN_BBOX_SPAN_DEG || lngSpan < MIN_BBOX_SPAN_DEG) {
    return { ok: false, error: `${label}: "bbox" — min mora biti manji od max.` };
  }
  if (latSpan > MAX_BBOX_SPAN_DEG || lngSpan > MAX_BBOX_SPAN_DEG) {
    return {
      ok: false,
      error: `${label}: "bbox" — raspon ne sme preći ${MAX_BBOX_SPAN_DEG}°.`,
    };
  }
  return { ok: true, map: { imageFile, bbox } };
}

function parseTimeLimit(
  raw: unknown,
  label: string,
  type: KvizQuestionType
): { ok: true; timeLimit: number } | { ok: false; error: string } {
  if (raw === undefined) {
    return { ok: true, timeLimit: KVIZ_DEFAULT_TIME_LIMIT[type] };
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return { ok: false, error: `${label}: timeLimit mora biti ceo broj.` };
  }
  if (raw < MIN_TIME_LIMIT || raw > MAX_TIME_LIMIT) {
    return {
      ok: false,
      error: `${label}: timeLimit mora biti između ${MIN_TIME_LIMIT} i ${MAX_TIME_LIMIT} sekundi.`,
    };
  }
  return { ok: true, timeLimit: raw };
}

function parseChoiceCore(
  raw: Record<string, unknown>,
  label: string
): { ok: true; text: string; options: string[]; correctIndex: number } | { ok: false; error: string } {
  if (!isNonEmptyString(raw.text)) {
    return { ok: false, error: `${label}: nedostaje tekst pitanja.` };
  }
  if ((raw.text as string).length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `${label}: tekst predugačak (max ${MAX_TEXT_LENGTH} znakova).` };
  }
  if (!Array.isArray(raw.options)) {
    return { ok: false, error: `${label}: "options" mora biti niz.` };
  }
  if (raw.options.length < MIN_OPTIONS || raw.options.length > MAX_OPTIONS) {
    return {
      ok: false,
      error: `${label}: mora imati između ${MIN_OPTIONS} i ${MAX_OPTIONS} odgovora.`,
    };
  }
  for (let j = 0; j < raw.options.length; j++) {
    if (!isNonEmptyString(raw.options[j])) {
      return { ok: false, error: `${label}: odgovor ${j + 1} je prazan.` };
    }
  }
  if (typeof raw.correctIndex !== 'number' || !Number.isInteger(raw.correctIndex)) {
    return { ok: false, error: `${label}: nedostaje correctIndex.` };
  }
  if (raw.correctIndex < 0 || raw.correctIndex >= raw.options.length) {
    return { ok: false, error: `${label}: correctIndex van opsega.` };
  }
  return {
    ok: true,
    text: (raw.text as string).trim(),
    options: (raw.options as string[]).map((t) => t.trim()),
    correctIndex: raw.correctIndex,
  };
}

/** Optional trimmed text field with the shared length cap. */
function parseOptionalText(
  raw: unknown,
  label: string
): { ok: true; text?: string } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true };
  if (typeof raw !== 'string') {
    return { ok: false, error: `${label}: "text" mora biti string.` };
  }
  const text = raw.trim() || undefined;
  if (text && text.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `${label}: tekst predugačak (max ${MAX_TEXT_LENGTH} znakova).` };
  }
  return { ok: true, text };
}

/** Required free-text answer + optional accept[] list (shared caps). */
function parseAnswerWithAccept(
  raw: Record<string, unknown>,
  label: string
): { ok: true; answer: string; accept?: string[] } | { ok: false; error: string } {
  if (!isNonEmptyString(raw.answer)) {
    return { ok: false, error: `${label}: nedostaje odgovor.` };
  }
  const answer = (raw.answer as string).trim();
  if (answer.length > MAX_EMOJI_ANSWER_LENGTH) {
    return { ok: false, error: `${label}: odgovor je predugačak.` };
  }
  let accept: string[] | undefined;
  if (raw.accept !== undefined && raw.accept !== null) {
    if (!Array.isArray(raw.accept)) {
      return { ok: false, error: `${label}: "accept" mora biti niz.` };
    }
    if (raw.accept.length > MAX_EMOJI_ACCEPT) {
      return { ok: false, error: `${label}: previše alternativnih odgovora.` };
    }
    const cleaned: string[] = [];
    for (const a of raw.accept) {
      if (!isNonEmptyString(a)) {
        return { ok: false, error: `${label}: prazan alternativni odgovor.` };
      }
      if ((a as string).trim().length > MAX_EMOJI_ANSWER_LENGTH) {
        return { ok: false, error: `${label}: alternativni odgovor je predugačak.` };
      }
      cleaned.push((a as string).trim());
    }
    if (cleaned.length > 0) accept = cleaned;
  }
  return { ok: true, answer, accept };
}

// Redosled limits.
const MIN_REDOSLED_ITEMS = 3;
const MAX_REDOSLED_ITEMS = 10;
const MAX_REDOSLED_ITEM_LENGTH = 80;
// Dopuna quote cap (longer than plain question text — it's a quote/lyric).
const MAX_QUOTE_LENGTH = 300;
// Domino limits.
const MIN_DOMINO_ITEMS = 3;
const MAX_DOMINO_ITEMS = 12;
const MAX_DOMINO_LABEL_LENGTH = 80;
const MAX_DOMINO_BTN_LENGTH = 24;
// Matrica limits (fixed 3×3 grid, pick 3).
const MATRICA_CELLS = 9;
const MATRICA_PICK = 3;
const MAX_MATRICA_CELL_LENGTH = 60;
const MAX_MATRICA_EXPLANATION_LENGTH = 200;

/**
 * Validates and normalizes raw parsed JSON into a KvizPackManifest.
 * Used by the host (pre-flight on file upload, 'inline'), the server pack
 * resolver + admin editor ('pack'), and the summaries endpoint.
 */
export function parseQuizImport(
  input: unknown,
  opts: QuizParseOptions
): QuizImportResult {
  const isPack = opts.context === 'pack';

  // Back-compat: a bare array is a manifest with just questions.
  let rawManifest: Record<string, unknown>;
  if (Array.isArray(input)) {
    rawManifest = { questions: input };
  } else if (input && typeof input === 'object') {
    rawManifest = input as Record<string, unknown>;
  } else {
    return { ok: false, error: 'Fajl mora biti lista pitanja ili manifest objekat.' };
  }

  let name: string | undefined;
  if (rawManifest.name !== undefined) {
    if (typeof rawManifest.name !== 'string') {
      return { ok: false, error: '"name" mora biti string.' };
    }
    name = rawManifest.name.trim() || undefined;
  }
  let description: string | undefined;
  if (rawManifest.description !== undefined) {
    if (typeof rawManifest.description !== 'string') {
      return { ok: false, error: '"description" mora biti string.' };
    }
    description = rawManifest.description.trim() || undefined;
  }

  // Category — lax: a non-string or unknown id is silently dropped (falls back
  // to 'ostalo' on display), never a validation error.
  let category: KvizCategoryId | undefined;
  if (typeof rawManifest.category === 'string' && KVIZ_CATEGORY_IDS.has(rawManifest.category)) {
    category = rawManifest.category as KvizCategoryId;
  }

  // Maps (pack context only).
  let maps: Record<string, GeoPackMapDef> | undefined;
  if (rawManifest.maps !== undefined && rawManifest.maps !== null) {
    if (!isPack) {
      return { ok: false, error: 'Custom mape su podržane samo u serverskim paketima.' };
    }
    if (typeof rawManifest.maps !== 'object' || Array.isArray(rawManifest.maps)) {
      return { ok: false, error: '"maps" mora biti objekat.' };
    }
    maps = {};
    for (const [mapId, def] of Object.entries(rawManifest.maps as Record<string, unknown>)) {
      if (!MAP_ID_RE.test(mapId)) {
        return { ok: false, error: `Nevažeći id mape "${mapId}" (mala slova, cifre, crtice).` };
      }
      const parsed = parseMapDef(def, `Mapa "${mapId}"`);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      maps[mapId] = parsed.map;
    }
    if (Object.keys(maps).length === 0) maps = undefined;
  }

  if (!Array.isArray(rawManifest.questions)) {
    return { ok: false, error: 'Nedostaje lista pitanja ("questions").' };
  }
  const rawQuestions = rawManifest.questions;
  const minQuestions = opts.allowEmpty ? 0 : MIN_QUESTIONS;
  if (rawQuestions.length < minQuestions) {
    return { ok: false, error: 'Lista je prazna.' };
  }
  if (rawQuestions.length > MAX_QUESTIONS) {
    return { ok: false, error: `Najviše ${MAX_QUESTIONS} pitanja po paketu.` };
  }

  const questions: KvizImportQuestion[] = [];
  // Author tags per question, index-aligned with `questions` (exactly one
  // question is pushed per successful loop iteration). Applied after the loop.
  const perQuestionTags: (KvizQuestionTag[] | undefined)[] = [];

  for (let i = 0; i < rawQuestions.length; i++) {
    const raw = rawQuestions[i] as Record<string, unknown> | undefined;
    const label = `Pitanje ${i + 1}`;

    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: `${label}: nije objekat.` };
    }

    perQuestionTags.push(parseQuestionTags(raw.tags));

    let type: KvizQuestionType = 'obicno';
    if (raw.type !== undefined) {
      if (
        typeof raw.type !== 'string' ||
        ![
          'obicno',
          'geo',
          'broj',
          'audio',
          'video',
          'emoji',
          'uljez',
          'dopuna',
          'piksel',
          'anagram',
          'redosled',
          'domino',
          'matrica',
        ].includes(raw.type)
      ) {
        return {
          ok: false,
          error: `${label}: nepoznat tip "${String(raw.type)}" (obicno/geo/broj/audio/video/emoji/uljez/dopuna/piksel/anagram/redosled/domino/matrica).`,
        };
      }
      type = raw.type as KvizQuestionType;
    }

    const time = parseTimeLimit(raw.timeLimit, label, type);
    if (!time.ok) return { ok: false, error: time.error };

    // Shared image handling (all types accept an optional image except geo,
    // where the image is the question and is required).
    const imageFileParsed = parsePackFile(raw.imageFile, label, 'imageFile');
    if (!imageFileParsed.ok) return { ok: false, error: imageFileParsed.error };
    if (imageFileParsed.file && !isPack) {
      return { ok: false, error: `${label}: "imageFile" radi samo u serverskim paketima — koristi imageUrl.` };
    }
    const imageUrlParsed = parseImageUrl(raw.imageUrl, label);
    if (!imageUrlParsed.ok) return { ok: false, error: imageUrlParsed.error };
    if (imageFileParsed.file && imageUrlParsed.imageUrl) {
      return { ok: false, error: `${label}: navedi ili "imageFile" ili "imageUrl", ne oba.` };
    }
    const imageFile = imageFileParsed.file;
    const imageUrl = imageUrlParsed.imageUrl;

    if (type === 'geo') {
      let text: string | undefined;
      if (raw.text !== undefined) {
        if (typeof raw.text !== 'string') {
          return { ok: false, error: `${label}: "text" mora biti string.` };
        }
        text = raw.text.trim() || undefined;
        if (text && text.length > MAX_TEXT_LENGTH) {
          return { ok: false, error: `${label}: tekst predugačak (max ${MAX_TEXT_LENGTH} znakova).` };
        }
      }
      // The photo is now optional: a geo question can be text-only (e.g. "Gde
      // je glavni grad Srbije?"), where the map is the whole prompt. But it
      // must carry SOMETHING to ask — either an image or prompt text.
      if (!imageFile && !imageUrl && !text) {
        return { ok: false, error: `${label}: geo pitanje mora imati sliku ("imageFile"/"imageUrl") ili tekst pitanja ("text").` };
      }
      let caption: string | undefined;
      if (raw.caption !== undefined) {
        if (typeof raw.caption !== 'string') {
          return { ok: false, error: `${label}: "caption" mora biti string.` };
        }
        caption = raw.caption.trim() || undefined;
        if (caption && caption.length > MAX_CAPTION_LENGTH) {
          return { ok: false, error: `${label}: "caption" predugačak (max ${MAX_CAPTION_LENGTH} znakova).` };
        }
      }
      let mapId: string | undefined;
      if (raw.mapId !== undefined && raw.mapId !== null && raw.mapId !== '') {
        if (!isPack) {
          return { ok: false, error: `${label}: "mapId" radi samo u serverskim paketima.` };
        }
        if (typeof raw.mapId !== 'string' || !maps || !maps[raw.mapId]) {
          return { ok: false, error: `${label}: mapa "${String(raw.mapId)}" ne postoji u "maps".` };
        }
        mapId = raw.mapId;
      }
      const map = mapId && maps ? maps[mapId] : undefined;
      const latMin = map ? map.bbox.minLat : SERBIA_MIN_LAT;
      const latMax = map ? map.bbox.maxLat : SERBIA_MAX_LAT;
      const lngMin = map ? map.bbox.minLng : SERBIA_MIN_LNG;
      const lngMax = map ? map.bbox.maxLng : SERBIA_MAX_LNG;
      if (!isFiniteNumber(raw.lat) || raw.lat < latMin || raw.lat > latMax) {
        return {
          ok: false,
          error: `${label}: "lat" mora biti broj između ${latMin} i ${latMax}${map ? ' (bbox mape)' : ''}.`,
        };
      }
      if (!isFiniteNumber(raw.lng) || raw.lng < lngMin || raw.lng > lngMax) {
        return {
          ok: false,
          error: `${label}: "lng" mora biti broj između ${lngMin} i ${lngMax}${map ? ' (bbox mape)' : ''}.`,
        };
      }
      questions.push({
        type: 'geo',
        text,
        imageFile,
        imageUrl,
        caption,
        lat: raw.lat,
        lng: raw.lng,
        mapId,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    if (type === 'emoji') {
      if (!isNonEmptyString(raw.emojis)) {
        return { ok: false, error: `${label}: nedostaju emojiji.` };
      }
      const emojis = (raw.emojis as string).trim();
      if (emojis.length > MAX_EMOJIS_LENGTH) {
        return { ok: false, error: `${label}: emojiji su predugački.` };
      }
      if (!isNonEmptyString(raw.answer)) {
        return { ok: false, error: `${label}: nedostaje odgovor.` };
      }
      const answer = (raw.answer as string).trim();
      if (answer.length > MAX_EMOJI_ANSWER_LENGTH) {
        return { ok: false, error: `${label}: odgovor je predugačak.` };
      }
      let text: string | undefined;
      if (raw.text !== undefined) {
        if (typeof raw.text !== 'string') {
          return { ok: false, error: `${label}: "text" mora biti string.` };
        }
        text = raw.text.trim() || undefined;
        if (text && text.length > MAX_TEXT_LENGTH) {
          return { ok: false, error: `${label}: tekst predugačak (max ${MAX_TEXT_LENGTH} znakova).` };
        }
      }
      let accept: string[] | undefined;
      if (raw.accept !== undefined && raw.accept !== null) {
        if (!Array.isArray(raw.accept)) {
          return { ok: false, error: `${label}: "accept" mora biti niz.` };
        }
        if (raw.accept.length > MAX_EMOJI_ACCEPT) {
          return { ok: false, error: `${label}: previše alternativnih odgovora.` };
        }
        const cleaned: string[] = [];
        for (const a of raw.accept) {
          if (!isNonEmptyString(a)) {
            return { ok: false, error: `${label}: prazan alternativni odgovor.` };
          }
          if ((a as string).trim().length > MAX_EMOJI_ANSWER_LENGTH) {
            return { ok: false, error: `${label}: alternativni odgovor je predugačak.` };
          }
          cleaned.push((a as string).trim());
        }
        if (cleaned.length > 0) accept = cleaned;
      }
      let category: string | undefined;
      if (raw.category !== undefined && raw.category !== null) {
        if (typeof raw.category !== 'string') {
          return { ok: false, error: `${label}: "category" mora biti string.` };
        }
        category = raw.category.trim() || undefined;
        if (category && category.length > MAX_EMOJI_CATEGORY_LENGTH) {
          return { ok: false, error: `${label}: kategorija je predugačka (max ${MAX_EMOJI_CATEGORY_LENGTH}).` };
        }
      }
      questions.push({
        type: 'emoji',
        text,
        emojis,
        answer,
        accept,
        category,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    if (type === 'dopuna') {
      const text = parseOptionalText(raw.text, label);
      if (!text.ok) return { ok: false, error: text.error };
      if (!isNonEmptyString(raw.quote)) {
        return { ok: false, error: `${label}: nedostaje "quote" (vidljivi deo citata).` };
      }
      const quote = (raw.quote as string).trim();
      if (quote.length > MAX_QUOTE_LENGTH) {
        return { ok: false, error: `${label}: citat predugačak (max ${MAX_QUOTE_LENGTH} znakova).` };
      }
      const aa = parseAnswerWithAccept(raw, label);
      if (!aa.ok) return { ok: false, error: aa.error };
      questions.push({
        type: 'dopuna',
        text: text.text,
        quote,
        answer: aa.answer,
        accept: aa.accept,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    if (type === 'piksel') {
      const text = parseOptionalText(raw.text, label);
      if (!text.ok) return { ok: false, error: text.error };
      if (!imageFile && !imageUrl) {
        return { ok: false, error: `${label}: piksel pitanje mora imati sliku ("imageFile" ili "imageUrl").` };
      }
      const aa = parseAnswerWithAccept(raw, label);
      if (!aa.ok) return { ok: false, error: aa.error };
      questions.push({
        type: 'piksel',
        text: text.text,
        imageFile,
        imageUrl,
        answer: aa.answer,
        accept: aa.accept,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    if (type === 'anagram') {
      const text = parseOptionalText(raw.text, label);
      if (!text.ok) return { ok: false, error: text.error };
      const aa = parseAnswerWithAccept(raw, label);
      if (!aa.ok) return { ok: false, error: aa.error };
      questions.push({
        type: 'anagram',
        text: text.text,
        answer: aa.answer,
        accept: aa.accept,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    if (type === 'redosled') {
      if (!isNonEmptyString(raw.text)) {
        return { ok: false, error: `${label}: nedostaje tekst pitanja.` };
      }
      const text = (raw.text as string).trim();
      if (text.length > MAX_TEXT_LENGTH) {
        return { ok: false, error: `${label}: tekst predugačak (max ${MAX_TEXT_LENGTH} znakova).` };
      }
      if (!Array.isArray(raw.items)) {
        return { ok: false, error: `${label}: "items" mora biti niz pojmova.` };
      }
      if (
        raw.items.length < MIN_REDOSLED_ITEMS ||
        raw.items.length > MAX_REDOSLED_ITEMS
      ) {
        return {
          ok: false,
          error: `${label}: redosled mora imati između ${MIN_REDOSLED_ITEMS} i ${MAX_REDOSLED_ITEMS} pojmova.`,
        };
      }
      const items: string[] = [];
      for (let j = 0; j < raw.items.length; j++) {
        if (!isNonEmptyString(raw.items[j])) {
          return { ok: false, error: `${label}: pojam ${j + 1} je prazan.` };
        }
        const it = (raw.items[j] as string).trim();
        if (it.length > MAX_REDOSLED_ITEM_LENGTH) {
          return { ok: false, error: `${label}: pojam ${j + 1} je predugačak.` };
        }
        items.push(it);
      }
      questions.push({
        type: 'redosled',
        text,
        items,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    if (type === 'domino') {
      const text = parseOptionalText(raw.text, label);
      if (!text.ok) return { ok: false, error: text.error };
      if (!Array.isArray(raw.items)) {
        return { ok: false, error: `${label}: "items" mora biti niz stavki.` };
      }
      if (
        raw.items.length < MIN_DOMINO_ITEMS ||
        raw.items.length > MAX_DOMINO_ITEMS
      ) {
        return {
          ok: false,
          error: `${label}: domino mora imati između ${MIN_DOMINO_ITEMS} i ${MAX_DOMINO_ITEMS} stavki.`,
        };
      }
      const items: { label: string; value: number }[] = [];
      for (let j = 0; j < raw.items.length; j++) {
        const it = raw.items[j] as Record<string, unknown> | undefined;
        if (!it || typeof it !== 'object') {
          return { ok: false, error: `${label}: stavka ${j + 1} nije objekat.` };
        }
        if (!isNonEmptyString(it.label)) {
          return { ok: false, error: `${label}: stavka ${j + 1} nema naziv ("label").` };
        }
        const itLabel = (it.label as string).trim();
        if (itLabel.length > MAX_DOMINO_LABEL_LENGTH) {
          return { ok: false, error: `${label}: stavka ${j + 1} je predugačka.` };
        }
        if (!isFiniteNumber(it.value)) {
          return { ok: false, error: `${label}: stavka ${j + 1} nema broj ("value").` };
        }
        items.push({ label: itLabel, value: it.value });
      }
      // Consecutive equal values make a step unanswerable — reject ties in the
      // presented order.
      for (let j = 1; j < items.length; j++) {
        if (items[j].value === items[j - 1].value) {
          return {
            ok: false,
            error: `${label}: stavke ${j} i ${j + 1} imaju istu vrednost — nema "pre/posle".`,
          };
        }
      }
      let lowerLabel: string | undefined;
      let higherLabel: string | undefined;
      for (const [key, target] of [
        ['lowerLabel', 'lower'],
        ['higherLabel', 'higher'],
      ] as const) {
        const v = raw[key];
        if (v === undefined || v === null || v === '') continue;
        if (typeof v !== 'string') {
          return { ok: false, error: `${label}: "${key}" mora biti string.` };
        }
        const t = v.trim();
        if (t.length > MAX_DOMINO_BTN_LENGTH) {
          return { ok: false, error: `${label}: "${key}" je predugačak.` };
        }
        if (target === 'lower') lowerLabel = t || undefined;
        else higherLabel = t || undefined;
      }
      let unit: string | undefined;
      if (raw.unit !== undefined) {
        if (typeof raw.unit !== 'string') {
          return { ok: false, error: `${label}: "unit" mora biti string.` };
        }
        const trimmed = raw.unit.trim();
        if (trimmed.length > MAX_UNIT_LENGTH) {
          return { ok: false, error: `${label}: "unit" predugačak (max ${MAX_UNIT_LENGTH} znakova).` };
        }
        unit = trimmed || undefined;
      }
      let valueType: KvizValueType | undefined;
      if (raw.valueType !== undefined) {
        if (
          typeof raw.valueType !== 'string' ||
          !VALUE_TYPES.has(raw.valueType as KvizValueType)
        ) {
          return { ok: false, error: `${label}: "valueType" mora biti "number" ili "duration".` };
        }
        valueType = raw.valueType as KvizValueType;
      }
      questions.push({
        type: 'domino',
        text: text.text,
        items,
        lowerLabel,
        higherLabel,
        unit,
        valueType,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    if (type === 'matrica') {
      const text = parseOptionalText(raw.text, label);
      if (!text.ok) return { ok: false, error: text.error };
      if (!Array.isArray(raw.cells) || raw.cells.length !== MATRICA_CELLS) {
        return { ok: false, error: `${label}: matrica mora imati tačno ${MATRICA_CELLS} polja (3×3).` };
      }
      const cells: string[] = [];
      for (let j = 0; j < raw.cells.length; j++) {
        if (!isNonEmptyString(raw.cells[j])) {
          return { ok: false, error: `${label}: polje ${j + 1} je prazno.` };
        }
        const cell = (raw.cells[j] as string).trim();
        if (cell.length > MAX_MATRICA_CELL_LENGTH) {
          return { ok: false, error: `${label}: polje ${j + 1} je predugačko.` };
        }
        cells.push(cell);
      }
      if (!Array.isArray(raw.correct) || raw.correct.length !== MATRICA_PICK) {
        return { ok: false, error: `${label}: "correct" mora imati tačno ${MATRICA_PICK} polja.` };
      }
      const seen = new Set<number>();
      const correct: number[] = [];
      for (const v of raw.correct) {
        if (!Number.isInteger(v) || v < 0 || v >= MATRICA_CELLS || seen.has(v as number)) {
          return { ok: false, error: `${label}: "correct" mora biti 3 različita broja između 1 i ${MATRICA_CELLS}.` };
        }
        seen.add(v as number);
        correct.push(v as number);
      }
      let explanation: string | undefined;
      if (raw.explanation !== undefined && raw.explanation !== null) {
        if (typeof raw.explanation !== 'string') {
          return { ok: false, error: `${label}: "explanation" mora biti string.` };
        }
        explanation = raw.explanation.trim() || undefined;
        if (explanation && explanation.length > MAX_MATRICA_EXPLANATION_LENGTH) {
          return { ok: false, error: `${label}: "explanation" predugačak (max ${MAX_MATRICA_EXPLANATION_LENGTH}).` };
        }
      }
      questions.push({
        type: 'matrica',
        text: text.text,
        cells,
        correct,
        explanation,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    if (type === 'uljez') {
      // Choice mechanics but the prompt is optional and exactly 4 pojma.
      const text = parseOptionalText(raw.text, label);
      if (!text.ok) return { ok: false, error: text.error };
      const core = parseChoiceCore(
        { ...raw, text: text.text ?? KVIZ_ULJEZ_DEFAULT_TEXT },
        label
      );
      if (!core.ok) return { ok: false, error: core.error };
      if (core.options.length !== 4) {
        return { ok: false, error: `${label}: uljez pitanje mora imati tačno 4 pojma.` };
      }
      questions.push({
        type: 'uljez',
        text: core.text,
        options: core.options,
        correctIndex: core.correctIndex,
        imageFile,
        imageUrl,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    if (type === 'broj') {
      if (!isNonEmptyString(raw.text)) {
        return { ok: false, error: `${label}: nedostaje "text".` };
      }
      if ((raw.text as string).length > MAX_TEXT_LENGTH) {
        return { ok: false, error: `${label}: tekst predugačak (max ${MAX_TEXT_LENGTH} znakova).` };
      }
      if (!isFiniteNumber(raw.answer)) {
        return { ok: false, error: `${label}: "answer" mora biti broj.` };
      }
      if (!isFiniteNumber(raw.min) || !isFiniteNumber(raw.max)) {
        return { ok: false, error: `${label}: "min" i "max" moraju biti brojevi.` };
      }
      if (raw.min >= raw.max) {
        return { ok: false, error: `${label}: "min" mora biti manji od "max".` };
      }
      if (raw.answer < raw.min || raw.answer > raw.max) {
        return { ok: false, error: `${label}: "answer" mora biti između "min" i "max".` };
      }
      let step: number | undefined;
      if (raw.step !== undefined) {
        if (!isFiniteNumber(raw.step) || raw.step <= 0) {
          return { ok: false, error: `${label}: "step" mora biti pozitivan broj.` };
        }
        if (raw.step > raw.max - raw.min) {
          return { ok: false, error: `${label}: "step" je veći od raspona.` };
        }
        step = raw.step;
      }
      let unit: string | undefined;
      if (raw.unit !== undefined) {
        if (typeof raw.unit !== 'string') {
          return { ok: false, error: `${label}: "unit" mora biti string.` };
        }
        const trimmed = raw.unit.trim();
        if (trimmed.length > MAX_UNIT_LENGTH) {
          return { ok: false, error: `${label}: "unit" predugačak (max ${MAX_UNIT_LENGTH} znakova).` };
        }
        unit = trimmed || undefined;
      }
      let valueType: KvizValueType | undefined;
      if (raw.valueType !== undefined) {
        if (
          typeof raw.valueType !== 'string' ||
          !VALUE_TYPES.has(raw.valueType as KvizValueType)
        ) {
          return { ok: false, error: `${label}: "valueType" mora biti "number" ili "duration".` };
        }
        valueType = raw.valueType as KvizValueType;
      }
      let emoji: string | undefined;
      if (raw.emoji !== undefined) {
        if (typeof raw.emoji !== 'string') {
          return { ok: false, error: `${label}: "emoji" mora biti string.` };
        }
        const trimmed = raw.emoji.trim();
        if (trimmed.length > MAX_EMOJI_LENGTH) {
          return { ok: false, error: `${label}: "emoji" predugačak.` };
        }
        emoji = trimmed || undefined;
      }
      questions.push({
        type: 'broj',
        text: (raw.text as string).trim(),
        answer: raw.answer,
        min: raw.min,
        max: raw.max,
        step,
        unit,
        valueType,
        emoji,
        imageFile,
        imageUrl,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    // Choice types: obicno / audio / video.
    const core = parseChoiceCore(raw, label);
    if (!core.ok) return { ok: false, error: core.error };

    if (type === 'audio') {
      const audioFileParsed = parsePackFile(raw.audioFile, label, 'audioFile');
      if (!audioFileParsed.ok) return { ok: false, error: audioFileParsed.error };
      const audioFile = audioFileParsed.file;
      if (audioFile) {
        if (!isPack) {
          return { ok: false, error: `${label}: "audioFile" radi samo u serverskim paketima — koristi audioUrl.` };
        }
        if (!AUDIO_EXT_RE.test(audioFile)) {
          return { ok: false, error: `${label}: audio fajl mora biti .mp3, .ogg ili .m4a.` };
        }
      }
      let audioUrl: string | undefined;
      if (raw.audioUrl !== undefined && raw.audioUrl !== null && raw.audioUrl !== '') {
        if (typeof raw.audioUrl !== 'string') {
          return { ok: false, error: `${label}: "audioUrl" mora biti string.` };
        }
        audioUrl = raw.audioUrl.trim();
        if (audioUrl.length > MAX_AUDIO_URL_LENGTH) {
          return { ok: false, error: `${label}: "audioUrl" predugačak.` };
        }
        const allowed =
          audioUrl.startsWith('/kviz-files/') ||
          audioUrl.startsWith('http://') ||
          audioUrl.startsWith('https://');
        if (!allowed) {
          return { ok: false, error: `${label}: "audioUrl" mora biti http(s) URL ili /kviz-files/ putanja.` };
        }
      }
      if (audioFile && audioUrl) {
        return { ok: false, error: `${label}: navedi ili "audioFile" ili "audioUrl", ne oba.` };
      }
      if (!audioFile && !audioUrl) {
        return { ok: false, error: `${label}: audio pitanje mora imati zvuk ("audioFile" ili "audioUrl").` };
      }
      questions.push({
        type: 'audio',
        text: core.text,
        options: core.options,
        correctIndex: core.correctIndex,
        audioFile,
        audioUrl,
        imageFile,
        imageUrl,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    if (type === 'video') {
      if (!isNonEmptyString(raw.videoId) || !VIDEO_ID_RE.test((raw.videoId as string).trim())) {
        return { ok: false, error: `${label}: "videoId" mora biti YouTube id od 11 znakova.` };
      }
      const videoId = (raw.videoId as string).trim();
      let startSeconds: number | undefined;
      let endSeconds: number | undefined;
      for (const key of ['startSeconds', 'endSeconds'] as const) {
        const v = raw[key];
        if (v === undefined || v === null) continue;
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
          return { ok: false, error: `${label}: "${key}" mora biti nenegativan ceo broj.` };
        }
        if (key === 'startSeconds') startSeconds = v;
        else endSeconds = v;
      }
      if (startSeconds !== undefined && endSeconds !== undefined && endSeconds <= startSeconds) {
        return { ok: false, error: `${label}: "endSeconds" mora biti veći od "startSeconds".` };
      }
      questions.push({
        type: 'video',
        text: core.text,
        options: core.options,
        correctIndex: core.correctIndex,
        videoId,
        startSeconds,
        endSeconds,
        timeLimit: time.timeLimit,
      });
      continue;
    }

    // obicno
    questions.push({
      type: 'obicno',
      text: core.text,
      options: core.options,
      correctIndex: core.correctIndex,
      imageFile,
      imageUrl,
      timeLimit: time.timeLimit,
    });
  }

  // Re-attach author tags now that every question object exists.
  questions.forEach((q, i) => {
    const tags = perQuestionTags[i];
    if (tags && tags.length > 0) q.tags = tags;
  });

  return {
    ok: true,
    manifest: { name, description, category, maps, questions },
  };
}

/** Per-type question counts — for pack summaries and import previews. */
export function kvizTypeCounts(
  questions: KvizImportQuestion[]
): Partial<Record<KvizQuestionType, number>> {
  const counts: Partial<Record<KvizQuestionType, number>> = {};
  for (const q of questions) {
    const t: KvizQuestionType = q.type ?? 'obicno';
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

/** Build runtime QuizOption[] from plain option strings. */
export function kvizOptionsFromStrings(options: string[]): QuizOption[] {
  return options.map((t, idx) => ({
    index: idx,
    text: t,
    color: QUIZ_OPTION_COLORS[idx],
  }));
}

/**
 * Format a numeric value for display. `duration` shows mm:ss (value in
 * seconds); otherwise the number is grouped with dots and the optional unit
 * is appended. Shared by host and controller so the TV and the phone render
 * values identically.
 */
export function formatBrojValue(
  value: number,
  unit?: string,
  valueType?: KvizValueType
): string {
  if (valueType === 'duration') {
    const total = Math.max(0, Math.round(value));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  const rounded = Math.round(value);
  // Group thousands with a dot (sr locale style) without locale dependence.
  const grouped = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return unit ? `${grouped} ${unit}` : grouped;
}
