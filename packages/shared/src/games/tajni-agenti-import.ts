export interface TajniAgentiImportPack {
  name?: string;
  words: string[];
}

export type TajniAgentiImportResult =
  | { ok: true; pack: TajniAgentiImportPack }
  | { ok: false; error: string };

export const TAJNI_AGENTI_MIN_WORDS = 25;
export const TAJNI_AGENTI_MAX_WORDS = 500;
export const TAJNI_AGENTI_MAX_WORD_LENGTH = 30;
export const TAJNI_AGENTI_BOARD_SIZE = 25;
export const TAJNI_AGENTI_STARTING_TEAM_CARDS = 9;
export const TAJNI_AGENTI_OTHER_TEAM_CARDS = 8;
export const TAJNI_AGENTI_NEUTRAL_CARDS = 7;
export const TAJNI_AGENTI_ASSASSIN_CARDS = 1;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Accepts either a flat string[] or an object `{ name?, words }`.
 * Returns a deduplicated (case-insensitive) trimmed word list.
 */
export function parseTajniAgentiImport(
  input: unknown
): TajniAgentiImportResult {
  let name: string | undefined;
  let rawWords: unknown;

  if (Array.isArray(input)) {
    rawWords = input;
  } else if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (obj.name !== undefined) {
      if (!isNonEmptyString(obj.name)) {
        return { ok: false, error: 'Polje "name" mora biti tekst.' };
      }
      name = (obj.name as string).trim();
    }
    rawWords = obj.words;
  } else {
    return {
      ok: false,
      error: 'Fajl mora biti niz reči ili objekat sa poljem "words".',
    };
  }

  if (!Array.isArray(rawWords)) {
    return { ok: false, error: 'Polje "words" mora biti niz.' };
  }

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rawWords.length; i++) {
    const v = rawWords[i];
    if (!isNonEmptyString(v)) {
      return { ok: false, error: `Reč ${i + 1} je prazna ili nije tekst.` };
    }
    const trimmed = (v as string).trim();
    if (trimmed.length > TAJNI_AGENTI_MAX_WORD_LENGTH) {
      return {
        ok: false,
        error: `Reč ${i + 1} ("${trimmed.slice(0, 20)}…") je duža od ${TAJNI_AGENTI_MAX_WORD_LENGTH} znakova.`,
      };
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }

  if (cleaned.length < TAJNI_AGENTI_MIN_WORDS) {
    return {
      ok: false,
      error: `Paket mora imati najmanje ${TAJNI_AGENTI_MIN_WORDS} jedinstvenih reči (dobijeno ${cleaned.length}).`,
    };
  }
  if (cleaned.length > TAJNI_AGENTI_MAX_WORDS) {
    return {
      ok: false,
      error: `Paket sme imati najviše ${TAJNI_AGENTI_MAX_WORDS} reči.`,
    };
  }

  return { ok: true, pack: { name, words: cleaned } };
}
