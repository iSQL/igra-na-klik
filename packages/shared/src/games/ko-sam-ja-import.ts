import type { KoSamJaCategory, KoSamJaShape } from '../types/ko-sam-ja.js';

export interface KoSamJaImportFixedQuestion {
  shape: 'fixed';
  category: KoSamJaCategory;
  text: string;
  options: string[];
}

export interface KoSamJaImportPeerQuestion {
  shape: 'peer';
  category: KoSamJaCategory;
  text: string;
}

export interface KoSamJaImportFreeQuestion {
  shape: 'free';
  category: KoSamJaCategory;
  text: string;
  maxLength?: number;
}

export type KoSamJaImportQuestion =
  | KoSamJaImportFixedQuestion
  | KoSamJaImportPeerQuestion
  | KoSamJaImportFreeQuestion;

export type KoSamJaImportResult =
  | { ok: true; questions: KoSamJaImportQuestion[] }
  | { ok: false; error: string };

export const KO_SAM_JA_DEFAULT_FREE_MAX_LENGTH = 60;
export const KO_SAM_JA_MIN_FREE_MAX_LENGTH = 10;
export const KO_SAM_JA_MAX_FREE_MAX_LENGTH = 120;
export const KO_SAM_JA_MIN_FIXED_OPTIONS = 2;
export const KO_SAM_JA_MAX_FIXED_OPTIONS = 4;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function countOccurrences(s: string, sub: string): number {
  let count = 0;
  let i = 0;
  while (i < s.length) {
    const found = s.indexOf(sub, i);
    if (found === -1) break;
    count++;
    i = found + sub.length;
  }
  return count;
}

export function parseKoSamJaImport(input: unknown): KoSamJaImportResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Fajl mora biti lista pitanja (JSON niz).' };
  }
  if (input.length === 0) {
    return { ok: false, error: 'Lista je prazna.' };
  }

  const questions: KoSamJaImportQuestion[] = [];

  for (let i = 0; i < input.length; i++) {
    const raw = input[i] as Record<string, unknown> | undefined;
    const label = `Pitanje ${i + 1}`;

    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: `${label}: nije objekat.` };
    }

    if (raw.category !== 'family' && raw.category !== 'nsfw') {
      return {
        ok: false,
        error: `${label}: category mora biti "family" ili "nsfw".`,
      };
    }
    const category = raw.category as KoSamJaCategory;

    if (
      raw.shape !== 'fixed' &&
      raw.shape !== 'peer' &&
      raw.shape !== 'free'
    ) {
      return {
        ok: false,
        error: `${label}: shape mora biti "fixed", "peer" ili "free".`,
      };
    }
    const shape = raw.shape as KoSamJaShape;

    if (!isNonEmptyString(raw.text)) {
      return { ok: false, error: `${label}: nedostaje tekst pitanja.` };
    }
    const text = (raw.text as string).trim();

    if (countOccurrences(text, '{subject}') !== 1) {
      return {
        ok: false,
        error: `${label}: tekst mora sadržati {subject} tačno jednom.`,
      };
    }

    if (shape === 'fixed') {
      if (text.includes('{peer1}') || text.includes('{peer2}')) {
        return {
          ok: false,
          error: `${label}: fixed pitanja ne smeju sadržati {peer1} ili {peer2}.`,
        };
      }
      if (!Array.isArray(raw.options)) {
        return { ok: false, error: `${label}: "options" mora biti niz.` };
      }
      if (
        raw.options.length < KO_SAM_JA_MIN_FIXED_OPTIONS ||
        raw.options.length > KO_SAM_JA_MAX_FIXED_OPTIONS
      ) {
        return {
          ok: false,
          error: `${label}: mora imati između ${KO_SAM_JA_MIN_FIXED_OPTIONS} i ${KO_SAM_JA_MAX_FIXED_OPTIONS} opcija.`,
        };
      }
      const trimmed: string[] = [];
      for (let j = 0; j < raw.options.length; j++) {
        if (!isNonEmptyString(raw.options[j])) {
          return { ok: false, error: `${label}: opcija ${j + 1} je prazna.` };
        }
        trimmed.push((raw.options[j] as string).trim());
      }
      const seen = new Set<string>();
      for (const opt of trimmed) {
        const key = opt.toLowerCase();
        if (seen.has(key)) {
          return { ok: false, error: `${label}: opcije moraju biti različite.` };
        }
        seen.add(key);
      }
      questions.push({ shape: 'fixed', category, text, options: trimmed });
      continue;
    }

    if (shape === 'peer') {
      if ('options' in raw && raw.options !== undefined) {
        return {
          ok: false,
          error: `${label}: peer pitanja ne smeju imati "options".`,
        };
      }
      if (countOccurrences(text, '{peer1}') !== 1) {
        return {
          ok: false,
          error: `${label}: peer pitanje mora sadržati {peer1} tačno jednom.`,
        };
      }
      if (countOccurrences(text, '{peer2}') !== 1) {
        return {
          ok: false,
          error: `${label}: peer pitanje mora sadržati {peer2} tačno jednom.`,
        };
      }
      questions.push({ shape: 'peer', category, text });
      continue;
    }

    // shape === 'free'
    if ('options' in raw && raw.options !== undefined) {
      return {
        ok: false,
        error: `${label}: free pitanja ne smeju imati "options".`,
      };
    }
    if (text.includes('{peer1}') || text.includes('{peer2}')) {
      return {
        ok: false,
        error: `${label}: free pitanja ne smeju sadržati {peer1} ili {peer2}.`,
      };
    }
    let maxLength = KO_SAM_JA_DEFAULT_FREE_MAX_LENGTH;
    if (raw.maxLength !== undefined) {
      if (
        typeof raw.maxLength !== 'number' ||
        !Number.isInteger(raw.maxLength)
      ) {
        return { ok: false, error: `${label}: maxLength mora biti ceo broj.` };
      }
      if (
        raw.maxLength < KO_SAM_JA_MIN_FREE_MAX_LENGTH ||
        raw.maxLength > KO_SAM_JA_MAX_FREE_MAX_LENGTH
      ) {
        return {
          ok: false,
          error: `${label}: maxLength mora biti između ${KO_SAM_JA_MIN_FREE_MAX_LENGTH} i ${KO_SAM_JA_MAX_FREE_MAX_LENGTH}.`,
        };
      }
      maxLength = raw.maxLength;
    }
    questions.push({ shape: 'free', category, text, maxLength });
  }

  return { ok: true, questions };
}
