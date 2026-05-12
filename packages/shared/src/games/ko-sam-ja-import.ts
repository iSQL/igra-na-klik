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
  /**
   * Optional author-provided options. When present, the subject picks
   * one at round time and `{peer1}`/`{peer2}`/`{subject}` placeholders
   * inside option strings are interpolated against the chosen peer pair.
   * When omitted, the server auto-generates two peer-name buttons (the
   * original peer-shape behavior).
   */
  options?: string[];
}

export interface KoSamJaImportFreeQuestion {
  shape: 'free';
  category: KoSamJaCategory;
  text: string;
  maxLength?: number;
}

/**
 * "Most Likely To"-style: the subject picks one of N connected
 * co-players at round time. The author writes the question text only;
 * the server expands one button per peer (capped at `maxPeers`, default
 * 4). When `optionTemplate` is provided, each option becomes that
 * template with `{peer}` (and optionally `{subject}`) interpolated —
 * useful for adding context around the bare name (e.g. "odmah uzima
 * {peer}").
 */
export interface KoSamJaImportPickNQuestion {
  shape: 'pickN';
  category: KoSamJaCategory;
  text: string;
  optionTemplate?: string;
  maxPeers?: number;
  /**
   * Extra literal buttons to mix in alongside the peer-expanded ones.
   * Each entry may contain `{subject}` (interpolated at round time) but
   * not `{peer}`/`{peer1}`/`{peer2}` — extras are not peer-bound. After
   * the peer buttons are built, extras are appended and the full list
   * is shuffled so literals don't always land at the same position.
   */
  extraOptions?: string[];
}

export type KoSamJaImportQuestion =
  | KoSamJaImportFixedQuestion
  | KoSamJaImportPeerQuestion
  | KoSamJaImportFreeQuestion
  | KoSamJaImportPickNQuestion;

export type KoSamJaImportResult =
  | { ok: true; questions: KoSamJaImportQuestion[] }
  | { ok: false; error: string };

export const KO_SAM_JA_DEFAULT_FREE_MAX_LENGTH = 60;
export const KO_SAM_JA_MIN_FREE_MAX_LENGTH = 10;
export const KO_SAM_JA_MAX_FREE_MAX_LENGTH = 120;
export const KO_SAM_JA_MIN_FIXED_OPTIONS = 2;
export const KO_SAM_JA_MAX_FIXED_OPTIONS = 4;
export const KO_SAM_JA_DEFAULT_MAX_PEERS = 4;
export const KO_SAM_JA_MIN_MAX_PEERS = 2;
export const KO_SAM_JA_MAX_MAX_PEERS = 8;

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
      raw.shape !== 'free' &&
      raw.shape !== 'pickN'
    ) {
      return {
        ok: false,
        error: `${label}: shape mora biti "fixed", "peer", "free" ili "pickN".`,
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
      // Optional author-provided options. If present, the subject picks
      // one of them just-in-time (after peer interpolation) and the text
      // no longer needs to enumerate {peer1}/{peer2} itself. If absent,
      // the server auto-generates two peer-name buttons and the text
      // must spell out both placeholders.
      if ('options' in raw && raw.options !== undefined) {
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
            return {
              ok: false,
              error: `${label}: opcija ${j + 1} je prazna.`,
            };
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
        questions.push({ shape: 'peer', category, text, options: trimmed });
        continue;
      }
      if (countOccurrences(text, '{peer1}') !== 1) {
        return {
          ok: false,
          error: `${label}: peer pitanje mora sadržati {peer1} tačno jednom (ili dodaj "options" niz).`,
        };
      }
      if (countOccurrences(text, '{peer2}') !== 1) {
        return {
          ok: false,
          error: `${label}: peer pitanje mora sadržati {peer2} tačno jednom (ili dodaj "options" niz).`,
        };
      }
      questions.push({ shape: 'peer', category, text });
      continue;
    }

    if (shape === 'pickN') {
      if ('options' in raw && raw.options !== undefined) {
        return {
          ok: false,
          error: `${label}: pickN pitanja koriste "optionTemplate", ne "options".`,
        };
      }
      if (text.includes('{peer1}') || text.includes('{peer2}') || text.includes('{peer}')) {
        return {
          ok: false,
          error: `${label}: pickN tekst ne sme sadržati {peer}/{peer1}/{peer2} (peer-ovi su dugmad).`,
        };
      }
      let optionTemplate: string | undefined;
      if (raw.optionTemplate !== undefined) {
        if (!isNonEmptyString(raw.optionTemplate)) {
          return {
            ok: false,
            error: `${label}: optionTemplate mora biti tekst.`,
          };
        }
        const tpl = (raw.optionTemplate as string).trim();
        if (countOccurrences(tpl, '{peer}') !== 1) {
          return {
            ok: false,
            error: `${label}: optionTemplate mora sadržati {peer} tačno jednom.`,
          };
        }
        if (tpl.includes('{peer1}') || tpl.includes('{peer2}')) {
          return {
            ok: false,
            error: `${label}: optionTemplate ne sme sadržati {peer1} ili {peer2} (koristi {peer}).`,
          };
        }
        optionTemplate = tpl;
      }
      let maxPeers = KO_SAM_JA_DEFAULT_MAX_PEERS;
      if (raw.maxPeers !== undefined) {
        if (
          typeof raw.maxPeers !== 'number' ||
          !Number.isInteger(raw.maxPeers)
        ) {
          return { ok: false, error: `${label}: maxPeers mora biti ceo broj.` };
        }
        if (
          raw.maxPeers < KO_SAM_JA_MIN_MAX_PEERS ||
          raw.maxPeers > KO_SAM_JA_MAX_MAX_PEERS
        ) {
          return {
            ok: false,
            error: `${label}: maxPeers mora biti između ${KO_SAM_JA_MIN_MAX_PEERS} i ${KO_SAM_JA_MAX_MAX_PEERS}.`,
          };
        }
        maxPeers = raw.maxPeers;
      }
      let extraOptions: string[] | undefined;
      if (raw.extraOptions !== undefined) {
        if (!Array.isArray(raw.extraOptions)) {
          return {
            ok: false,
            error: `${label}: extraOptions mora biti niz.`,
          };
        }
        if (raw.extraOptions.length < 1 || raw.extraOptions.length > 4) {
          return {
            ok: false,
            error: `${label}: extraOptions mora imati između 1 i 4 unosa.`,
          };
        }
        const trimmedExtras: string[] = [];
        for (let j = 0; j < raw.extraOptions.length; j++) {
          const v = raw.extraOptions[j];
          if (!isNonEmptyString(v)) {
            return {
              ok: false,
              error: `${label}: extraOptions[${j + 1}] je prazan.`,
            };
          }
          const t = (v as string).trim();
          if (
            t.includes('{peer}') ||
            t.includes('{peer1}') ||
            t.includes('{peer2}')
          ) {
            return {
              ok: false,
              error: `${label}: extraOptions ne smeju sadržati {peer}/{peer1}/{peer2} (nisu vezani za igrača).`,
            };
          }
          trimmedExtras.push(t);
        }
        const seenExtras = new Set<string>();
        for (const t of trimmedExtras) {
          const key = t.toLowerCase();
          if (seenExtras.has(key)) {
            return {
              ok: false,
              error: `${label}: extraOptions moraju biti različiti.`,
            };
          }
          seenExtras.add(key);
        }
        extraOptions = trimmedExtras;
      }
      questions.push({
        shape: 'pickN',
        category,
        text,
        optionTemplate,
        maxPeers,
        extraOptions,
      });
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
