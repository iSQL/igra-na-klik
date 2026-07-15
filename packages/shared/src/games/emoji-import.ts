import type { EmojiRiddle } from '../types/emoji-zagonetke.js';

/**
 * Validator + answer-matching for „Emoji zagonetke". Same doctrine as
 * quiz-import: used by both the host (pre-flight) and the server
 * (authoritative re-check) so the two can't drift.
 */

export type EmojiImportResult =
  | { ok: true; puzzles: EmojiRiddle[] }
  | { ok: false; error: string };

const DEFAULT_TIME_LIMIT = 20;
const MIN_TIME_LIMIT = 5;
const MAX_TIME_LIMIT = 60;
const MAX_EMOJIS_LENGTH = 40;
const MAX_ANSWER_LENGTH = 60;
const MAX_ACCEPT = 8;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Normalize an answer for comparison: lowercase, fold Serbian diacritics,
 * drop punctuation and collapse whitespace. More forgiving than DrawGuess's
 * exact match so "Kralj Lavova!" == "kralj lavova".
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
export function checkEmojiGuess(guess: string, riddle: EmojiRiddle): boolean {
  const g = normalizeEmojiAnswer(guess);
  if (!g) return false;
  if (g === normalizeEmojiAnswer(riddle.answer)) return true;
  return (riddle.accept ?? []).some((a) => normalizeEmojiAnswer(a) === g);
}

export function parseEmojiImport(input: unknown): EmojiImportResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Fajl mora biti lista zagonetki (JSON niz).' };
  }
  if (input.length === 0) {
    return { ok: false, error: 'Lista je prazna.' };
  }

  const puzzles: EmojiRiddle[] = [];

  for (let i = 0; i < input.length; i++) {
    const raw = input[i] as Record<string, unknown> | undefined;
    const label = `Zagonetka ${i + 1}`;

    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: `${label}: nije objekat.` };
    }
    if (!isNonEmptyString(raw.emojis)) {
      return { ok: false, error: `${label}: nedostaju emojiji.` };
    }
    if ((raw.emojis as string).trim().length > MAX_EMOJIS_LENGTH) {
      return { ok: false, error: `${label}: emojiji su predugački.` };
    }
    if (!isNonEmptyString(raw.answer)) {
      return { ok: false, error: `${label}: nedostaje odgovor.` };
    }
    if ((raw.answer as string).trim().length > MAX_ANSWER_LENGTH) {
      return { ok: false, error: `${label}: odgovor je predugačak.` };
    }

    let accept: string[] | undefined;
    if (raw.accept !== undefined && raw.accept !== null) {
      if (!Array.isArray(raw.accept)) {
        return { ok: false, error: `${label}: "accept" mora biti niz.` };
      }
      if (raw.accept.length > MAX_ACCEPT) {
        return { ok: false, error: `${label}: previše alternativnih odgovora.` };
      }
      const cleaned: string[] = [];
      for (const a of raw.accept) {
        if (!isNonEmptyString(a)) {
          return { ok: false, error: `${label}: prazan alternativni odgovor.` };
        }
        if ((a as string).trim().length > MAX_ANSWER_LENGTH) {
          return { ok: false, error: `${label}: alternativni odgovor je predugačak.` };
        }
        cleaned.push((a as string).trim());
      }
      if (cleaned.length > 0) accept = cleaned;
    }

    let timeLimit = DEFAULT_TIME_LIMIT;
    if (raw.timeLimit !== undefined) {
      if (typeof raw.timeLimit !== 'number' || !Number.isInteger(raw.timeLimit)) {
        return { ok: false, error: `${label}: timeLimit mora biti ceo broj.` };
      }
      if (raw.timeLimit < MIN_TIME_LIMIT || raw.timeLimit > MAX_TIME_LIMIT) {
        return {
          ok: false,
          error: `${label}: timeLimit mora biti između ${MIN_TIME_LIMIT} i ${MAX_TIME_LIMIT} sekundi.`,
        };
      }
      timeLimit = raw.timeLimit;
    }

    puzzles.push({
      emojis: (raw.emojis as string).trim(),
      answer: (raw.answer as string).trim(),
      ...(accept ? { accept } : {}),
      timeLimit,
    });
  }

  return { ok: true, puzzles };
}
