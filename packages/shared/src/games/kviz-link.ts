import type { KvizQuestionType } from '../types/quiz.js';

/**
 * Kviz link — a quiz anyone can put together at /k/<naziv>, share as a link
 * and play from phones without a TV. The link's settings and questions live
 * server-side (they carry answers); what phones and the lobby see is the
 * answer-free `KvizLinkPublic` below.
 */

/** 3–40 chars, lowercase letters/digits/dashes, no leading/trailing dash. */
export const KVIZ_LINK_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** Path segments the /k/ router uses itself — never a quiz name. */
export const KVIZ_LINK_RESERVED_SLUGS: readonly string[] = [
  'novi',
  'new',
  'api',
  'uredi',
  'admin',
  'k',
  'files',
  'app',
];

/** Card icons offered by the editor (the server accepts any single emoji-ish string). */
export const KVIZ_LINK_ICONS: readonly string[] = [
  '🍺', '🎂', '📚', '⚽', '🎬', '🐸', '🎵', '🧠', '🏆', '🎉', '🍕', '🌍',
];

/** Card colours — the tile behind the icon and the cover fallback. */
export const KVIZ_LINK_COLORS: readonly string[] = [
  '#5a7a4e',
  '#1D3557',
  '#B85C4F',
  '#C29B47',
  '#6d9bd1',
];

/** Fixed per-question clocks; `null` keeps each question's own timeLimit. */
export const KVIZ_LINK_TIME_LIMITS: readonly number[] = [10, 20, 30];

/** "Igrači do" choices — the room cap of a link room. */
export const KVIZ_LINK_PLAYER_LIMITS: readonly number[] = [4, 6, 8, 10, 12, 15];

export const KVIZ_LINK_MAX_ITEMS = 200;
export const KVIZ_LINK_MAX_OWN = 100;
export const KVIZ_LINK_MAX_NAME = 60;
export const KVIZ_LINK_MAX_MESSAGE = 120;
/** Longest allowed validity window. */
export const KVIZ_LINK_MAX_DAYS = 366;
export const KVIZ_LINK_PIN_RE = /^\d{4}$/;
/** Optional entry PIN players must type to join (set by the editor). */
export const KVIZ_LINK_JOIN_PIN_RE = /^\d{4,6}$/;

export type KvizLinkStatus = 'scheduled' | 'active' | 'expired';

export function kvizLinkStatus(
  link: { validFrom: number; expiresAt: number },
  now = Date.now()
): KvizLinkStatus {
  if (now < link.validFrom) return 'scheduled';
  if (now > link.expiresAt) return 'expired';
  return 'active';
}

/** Short Serbian type labels, used in the lobby summary and the editor. */
export const KVIZ_TYPE_SHORT: Record<KvizQuestionType, string> = {
  obicno: 'obično',
  audio: 'audio',
  video: 'YouTube',
  geo: 'geo',
  broj: 'broj',
  emoji: 'emoji',
  uljez: 'uljez',
  dopuna: 'citat',
  piksel: 'piksel',
  anagram: 'anagram',
  redosled: 'redosled',
  domino: 'domino',
  matrica: 'matrica',
};

/**
 * What a phone may know about a link: branding, how long a game runs, the
 * validity window. No questions, no answers, no PIN.
 */
export interface KvizLinkPublic {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  message?: string;
  /** /k-files/<slug>/<file>, when the creator uploaded a cover. */
  coverUrl?: string;
  /** Questions in one game (the draw size in random mode). */
  questionCount: number;
  /** Fixed seconds per question, or null = each question's own. */
  timeLimit: number | null;
  /** "mešovito" or the single type's short label; empty when no questions. */
  typeSummary: string;
  validFrom: number;
  expiresAt: number;
  maxPlayers: number;
  /** Players must type the editor's entry PIN to join (the PIN itself never leaves the server). */
  joinPinRequired?: boolean;
}

/**
 * "Tvoji odgovori" — one player's own answers in a kviz-link game, sent only
 * in that player's `playerData` slice (`linkRecap`) from the first results
 * screen on, never in the broadcast. Strings are pre-formatted server-side.
 */
export interface KvizLinkRecap {
  rank: number;
  points: number;
  correct: number;
  /** Questions that reached their results so far. */
  total: number;
  items: {
    q: string;
    /** What the player answered, formatted; null = no answer. */
    a: string | null;
    /** null = no answer. */
    ok: boolean | null;
    /** The correct answer, formatted — absent where there is no single one (geo). */
    right?: string;
  }[];
}

/** Rough game length for the join card ("≈ 8 min"). */
export function kvizLinkEstimateMinutes(info: {
  questionCount: number;
  timeLimit: number | null;
}): number {
  // Question preview + answering + results, averaged over the quiz types.
  const perQuestion = 5 + (info.timeLimit ?? 22) + 6;
  return Math.max(1, Math.round((info.questionCount * perQuestion) / 60));
}
