import { QUIZ_OPTION_COLORS } from '../types/quiz.js';
import type { QuizQuestionFull } from '../types/quiz.js';

/**
 * Human-friendly wire format for imported quiz questions.
 * The server fills in `id` and the full `QuizOption` shape.
 */
export interface QuizImportQuestion {
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit?: number;
}

export type QuizImportResult =
  | { ok: true; questions: QuizQuestionFull[] }
  | { ok: false; error: string };

const DEFAULT_TIME_LIMIT = 15;
const MIN_TIME_LIMIT = 5;
const MAX_TIME_LIMIT = 60;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = QUIZ_OPTION_COLORS.length; // 4

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Validates and normalizes raw parsed JSON into full QuizQuestionFull[].
 * Used by both the host (pre-flight) and the server (authoritative re-check).
 */
export function parseQuizImport(input: unknown): QuizImportResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Fajl mora biti lista pitanja (JSON niz).' };
  }
  if (input.length === 0) {
    return { ok: false, error: 'Lista je prazna.' };
  }

  const questions: QuizQuestionFull[] = [];

  for (let i = 0; i < input.length; i++) {
    const raw = input[i] as Record<string, unknown> | undefined;
    const label = `Pitanje ${i + 1}`;

    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: `${label}: nije objekat.` };
    }

    if (!isNonEmptyString(raw.text)) {
      return { ok: false, error: `${label}: nedostaje tekst pitanja.` };
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

    if (
      typeof raw.correctIndex !== 'number' ||
      !Number.isInteger(raw.correctIndex)
    ) {
      return { ok: false, error: `${label}: nedostaje correctIndex.` };
    }
    if (raw.correctIndex < 0 || raw.correctIndex >= raw.options.length) {
      return { ok: false, error: `${label}: correctIndex van opsega.` };
    }

    let timeLimit = DEFAULT_TIME_LIMIT;
    if (raw.timeLimit !== undefined) {
      if (
        typeof raw.timeLimit !== 'number' ||
        !Number.isInteger(raw.timeLimit)
      ) {
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

    questions.push({
      id: `custom-${i + 1}`,
      text: (raw.text as string).trim(),
      options: (raw.options as string[]).map((t, idx) => ({
        index: idx,
        text: t.trim(),
        color: QUIZ_OPTION_COLORS[idx],
      })),
      correctIndex: raw.correctIndex,
      timeLimit,
    });
  }

  return { ok: true, questions };
}
