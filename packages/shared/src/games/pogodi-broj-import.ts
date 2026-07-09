import type {
  PogodiBrojQuestion,
  PogodiBrojValueType,
} from '../types/pogodi-godinu.js';

export interface PogodiBrojPackManifest {
  name: string;
  description?: string;
  questions: PogodiBrojQuestion[];
}

export type PogodiBrojPackParseResult =
  | { ok: true; manifest: PogodiBrojPackManifest }
  | { ok: false; error: string };

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 100;
const MAX_TEXT_LENGTH = 200;
const MAX_UNIT_LENGTH = 20;
const MAX_EMOJI_LENGTH = 8;
const VALUE_TYPES = new Set<PogodiBrojValueType>(['number', 'duration']);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validates and normalizes a "Pogodi broj" pack manifest. Used by:
 *  - server `/api/pogodi-broj-packs` listing endpoint (reject malformed packs);
 *  - server `pack-resolver` on game start (authoritative re-check);
 *  - server admin editor, with `allowEmpty` so a freshly created pack can
 *    exist with zero questions (strict game-side callers keep rejecting it,
 *    which keeps unfinished packs out of the in-game list).
 */
export function parsePogodiBrojImport(
  input: unknown,
  opts?: { allowEmpty?: boolean }
): PogodiBrojPackParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Manifest mora biti objekat.' };
  }
  const raw = input as Record<string, unknown>;

  if (!isNonEmptyString(raw.name)) {
    return { ok: false, error: 'Nedostaje "name".' };
  }
  if (raw.description !== undefined && typeof raw.description !== 'string') {
    return { ok: false, error: '"description" mora biti string.' };
  }
  if (!Array.isArray(raw.questions)) {
    return { ok: false, error: '"questions" mora biti niz.' };
  }
  const minQuestions = opts?.allowEmpty ? 0 : MIN_QUESTIONS;
  if (raw.questions.length < minQuestions || raw.questions.length > MAX_QUESTIONS) {
    return {
      ok: false,
      error: `"questions" mora imati između ${minQuestions} i ${MAX_QUESTIONS} stavki.`,
    };
  }

  const questions: PogodiBrojQuestion[] = [];
  for (let i = 0; i < raw.questions.length; i++) {
    const entry = raw.questions[i] as Record<string, unknown> | undefined;
    const label = `Pitanje ${i + 1}`;

    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: `${label}: nije objekat.` };
    }
    if (!isNonEmptyString(entry.text)) {
      return { ok: false, error: `${label}: nedostaje "text".` };
    }
    if ((entry.text as string).length > MAX_TEXT_LENGTH) {
      return {
        ok: false,
        error: `${label}: "text" predugačak (max ${MAX_TEXT_LENGTH} znakova).`,
      };
    }
    if (!isFiniteNumber(entry.answer)) {
      return { ok: false, error: `${label}: "answer" mora biti broj.` };
    }
    if (!isFiniteNumber(entry.min) || !isFiniteNumber(entry.max)) {
      return { ok: false, error: `${label}: "min" i "max" moraju biti brojevi.` };
    }
    if (entry.min >= entry.max) {
      return { ok: false, error: `${label}: "min" mora biti manji od "max".` };
    }
    if (entry.answer < entry.min || entry.answer > entry.max) {
      return {
        ok: false,
        error: `${label}: "answer" mora biti između "min" i "max".`,
      };
    }

    let step: number | undefined;
    if (entry.step !== undefined) {
      if (!isFiniteNumber(entry.step) || entry.step <= 0) {
        return { ok: false, error: `${label}: "step" mora biti pozitivan broj.` };
      }
      if (entry.step > entry.max - entry.min) {
        return { ok: false, error: `${label}: "step" je veći od raspona.` };
      }
      step = entry.step;
    }

    let unit: string | undefined;
    if (entry.unit !== undefined) {
      if (typeof entry.unit !== 'string') {
        return { ok: false, error: `${label}: "unit" mora biti string.` };
      }
      const trimmed = entry.unit.trim();
      if (trimmed.length > MAX_UNIT_LENGTH) {
        return {
          ok: false,
          error: `${label}: "unit" predugačak (max ${MAX_UNIT_LENGTH} znakova).`,
        };
      }
      unit = trimmed.length > 0 ? trimmed : undefined;
    }

    let valueType: PogodiBrojValueType | undefined;
    if (entry.valueType !== undefined) {
      if (
        typeof entry.valueType !== 'string' ||
        !VALUE_TYPES.has(entry.valueType as PogodiBrojValueType)
      ) {
        return {
          ok: false,
          error: `${label}: "valueType" mora biti "number" ili "duration".`,
        };
      }
      valueType = entry.valueType as PogodiBrojValueType;
    }

    let emoji: string | undefined;
    if (entry.emoji !== undefined) {
      if (typeof entry.emoji !== 'string') {
        return { ok: false, error: `${label}: "emoji" mora biti string.` };
      }
      const trimmed = entry.emoji.trim();
      if (trimmed.length > MAX_EMOJI_LENGTH) {
        return { ok: false, error: `${label}: "emoji" predugačak.` };
      }
      emoji = trimmed.length > 0 ? trimmed : undefined;
    }

    let imageFile: string | undefined;
    if (entry.imageFile !== undefined && entry.imageFile !== null) {
      if (!isNonEmptyString(entry.imageFile)) {
        return { ok: false, error: `${label}: "imageFile" mora biti string.` };
      }
      const file = (entry.imageFile as string).trim();
      if (file.includes('..') || file.includes('/') || file.includes('\\')) {
        return { ok: false, error: `${label}: nevažeća putanja slike.` };
      }
      imageFile = file;
    }

    questions.push({
      text: (entry.text as string).trim(),
      answer: entry.answer,
      min: entry.min,
      max: entry.max,
      step,
      unit,
      valueType,
      emoji,
      imageFile,
    });
  }

  return {
    ok: true,
    manifest: {
      name: (raw.name as string).trim(),
      description:
        typeof raw.description === 'string' ? raw.description.trim() : undefined,
      questions,
    },
  };
}

/**
 * Format a numeric value for display. `duration` shows mm:ss (value in
 * seconds); otherwise the number is grouped with thin separators and the
 * optional unit is appended. Shared by host and controller so the TV and the
 * phone render values identically.
 */
export function formatPogodiBrojValue(
  value: number,
  unit?: string,
  valueType?: PogodiBrojValueType
): string {
  if (valueType === 'duration') {
    const total = Math.max(0, Math.round(value));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  const rounded = Math.round(value);
  // Group thousands with a dot (sr locale style) without locale dependence.
  const grouped = rounded
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return unit ? `${grouped} ${unit}` : grouped;
}
