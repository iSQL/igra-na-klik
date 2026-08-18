import type { FibbageQuestion } from '../types/fibbage.js';
import { FIBBAGE_MAX_ANSWER_LENGTH } from '../types/fibbage.js';

/**
 * Lažov question packs — an admin-curated set of trivia questions that
 * replaces the built-in bank for a session. Same trust model as the other
 * packs: the parser runs on disk reads and on admin saves.
 *
 * Unlike Ko sam ja (whose packs are harmless to ship to the client), a Lažov
 * manifest **carries the answers**, so the public `GET /api/fibbage-packs`
 * returns summaries only and the chosen pack ids ride `host:start-game` to be
 * resolved server-side — the kviz model, for the same reason.
 */

export interface FibbagePackQuestion {
  text: string;
  answer: string;
  category?: string;
  /**
   * Extra spellings that also count as "the player typed the truth"
   * (auto-find). The canonical `answer` is always accepted; these cover
   * synonyms and number/word variants ("3" vs "tri").
   */
  accept?: string[];
}

export interface FibbagePack {
  name?: string;
  description?: string;
  questions: FibbagePackQuestion[];
}

/** A playable pack needs at least the minimum round count's worth. */
export const FIBBAGE_MIN_QUESTIONS = 3;
export const FIBBAGE_MAX_QUESTIONS = 500;
export const FIBBAGE_MAX_TEXT_LENGTH = 200;
export const FIBBAGE_MAX_CATEGORY_LENGTH = 40;
export const FIBBAGE_MAX_ACCEPT = 8;
export const FIBBAGE_MAX_PACK_NAME_LENGTH = 60;
export const FIBBAGE_MAX_PACK_DESCRIPTION_LENGTH = 200;

export type FibbagePackParseResult =
  | { ok: true; pack: FibbagePack }
  | { ok: false; error: string };

/**
 * Validate + normalize a raw pack object (from disk or an admin save).
 * `allowEmpty` (admin drafts) skips the min-questions floor so a freshly
 * created pack can sit at 0 questions; game-side callers stay strict.
 */
export function parseFibbagePack(
  raw: unknown,
  opts: { allowEmpty?: boolean } = {}
): FibbagePackParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Pack mora biti objekat.' };
  }
  const obj = raw as Record<string, unknown>;

  let name: string | undefined;
  if (obj.name !== undefined && obj.name !== null && obj.name !== '') {
    if (typeof obj.name !== 'string') {
      return { ok: false, error: 'Naziv mora biti tekst.' };
    }
    name = obj.name.trim().slice(0, FIBBAGE_MAX_PACK_NAME_LENGTH) || undefined;
  }

  let description: string | undefined;
  if (
    obj.description !== undefined &&
    obj.description !== null &&
    obj.description !== ''
  ) {
    if (typeof obj.description !== 'string') {
      return { ok: false, error: 'Opis mora biti tekst.' };
    }
    description =
      obj.description.trim().slice(0, FIBBAGE_MAX_PACK_DESCRIPTION_LENGTH) ||
      undefined;
  }

  if (!Array.isArray(obj.questions)) {
    return { ok: false, error: 'Polje "questions" mora biti niz.' };
  }
  if (!opts.allowEmpty && obj.questions.length < FIBBAGE_MIN_QUESTIONS) {
    return {
      ok: false,
      error: `Pack mora imati bar ${FIBBAGE_MIN_QUESTIONS} pitanja.`,
    };
  }
  if (obj.questions.length > FIBBAGE_MAX_QUESTIONS) {
    return {
      ok: false,
      error: `Pack može imati najviše ${FIBBAGE_MAX_QUESTIONS} pitanja.`,
    };
  }

  const questions: FibbagePackQuestion[] = [];
  const seenTexts = new Set<string>();

  for (let i = 0; i < obj.questions.length; i++) {
    const entry = obj.questions[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `Pitanje #${i + 1} mora biti objekat.` };
    }
    const q = entry as Record<string, unknown>;
    const label = `Pitanje #${i + 1}`;

    if (typeof q.text !== 'string' || !q.text.trim()) {
      return { ok: false, error: `${label}: nedostaje tekst pitanja.` };
    }
    const text = q.text.trim();
    if (text.length > FIBBAGE_MAX_TEXT_LENGTH) {
      return {
        ok: false,
        error: `${label}: tekst duži od ${FIBBAGE_MAX_TEXT_LENGTH} znakova.`,
      };
    }
    const textKey = text.toLowerCase().replace(/\s+/g, ' ');
    if (seenTexts.has(textKey)) {
      return { ok: false, error: `${label}: duplo pitanje ("${text}").` };
    }
    seenTexts.add(textKey);

    if (typeof q.answer !== 'string' || !q.answer.trim()) {
      return { ok: false, error: `${label}: nedostaje tačan odgovor.` };
    }
    const answer = q.answer.trim();
    // The real answer sits in the same vote list as the players' lies, so it
    // must fit the same box — a longer one would be a giveaway on its own.
    if (answer.length > FIBBAGE_MAX_ANSWER_LENGTH) {
      return {
        ok: false,
        error: `${label}: odgovor duži od ${FIBBAGE_MAX_ANSWER_LENGTH} znakova.`,
      };
    }

    let category: string | undefined;
    if (q.category !== undefined && q.category !== null && q.category !== '') {
      if (typeof q.category !== 'string') {
        return { ok: false, error: `${label}: kategorija mora biti tekst.` };
      }
      category =
        q.category.trim().slice(0, FIBBAGE_MAX_CATEGORY_LENGTH) || undefined;
    }

    let accept: string[] | undefined;
    if (q.accept !== undefined && q.accept !== null) {
      if (!Array.isArray(q.accept)) {
        return { ok: false, error: `${label}: polje "accept" mora biti niz.` };
      }
      if (q.accept.length > FIBBAGE_MAX_ACCEPT) {
        return {
          ok: false,
          error: `${label}: najviše ${FIBBAGE_MAX_ACCEPT} alternativnih odgovora.`,
        };
      }
      const list: string[] = [];
      for (const a of q.accept) {
        if (typeof a !== 'string' || !a.trim()) {
          return {
            ok: false,
            error: `${label}: svaki alternativni odgovor mora biti neprazan tekst.`,
          };
        }
        const alt = a.trim();
        if (alt.length > FIBBAGE_MAX_ANSWER_LENGTH) {
          return {
            ok: false,
            error: `${label}: alternativni odgovor duži od ${FIBBAGE_MAX_ANSWER_LENGTH} znakova.`,
          };
        }
        list.push(alt);
      }
      if (list.length > 0) accept = list;
    }

    questions.push({
      text,
      answer,
      ...(category ? { category } : {}),
      ...(accept ? { accept } : {}),
    });
  }

  return {
    ok: true,
    pack: {
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      questions,
    },
  };
}

/** Distinct categories present in a pack, in first-seen order. */
export function fibbagePackCategories(pack: FibbagePack): string[] {
  const seen: string[] = [];
  for (const q of pack.questions) {
    if (q.category && !seen.includes(q.category)) seen.push(q.category);
  }
  return seen;
}

/** Pack questions → runtime questions (ids are stable within one pack). */
export function fibbagePackToRuntime(
  pack: FibbagePack,
  idPrefix: string
): FibbageQuestion[] {
  return pack.questions.map((q, i) => ({
    id: `${idPrefix}-${i + 1}`,
    text: q.text,
    answer: q.answer,
    category: q.category,
    accept: q.accept,
  }));
}
