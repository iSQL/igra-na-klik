import type { KvizImportQuestion, KvizQuestionFull, KvizQuestionType } from '@igra/shared';
import {
  KVIZ_BANK_PACK_ID,
  QUIZ_QUESTION_BANK,
} from '@igra/shared';
import {
  importQuestionsToRuntime,
  listQuizPackSummaries,
  resolveQuizPack,
  type ResolvedQuizPack,
} from '../game/games/quiz/quiz-pack-resolver.js';

/**
 * A kviz link stores its questions as stable source keys, the same ones the
 * quiz-feedback file uses: `pack:<packId>:<index>`, `bank:<index>` for the
 * built-in bank, and `own:<id>` for the link's private questions. Pack
 * questions are resolved from disk at game start, so a fix to a pack reaches
 * every link that uses the question.
 */

export const KVIZ_LINK_ITEM_RE = /^(?:pack:[a-zA-Z0-9_-]+:\d{1,5}|bank:\d{1,5}|own:[a-z0-9]{1,24})$/;

export interface KvizLinkOwnQuestion {
  id: string;
  question: KvizImportQuestion;
}

export interface ResolvedLinkQuestion {
  key: string;
  question: KvizQuestionFull;
}

/** Public URL of a file in a link's folder. */
export function kvizLinkFileUrl(slug: string, file: string): string {
  return `/k-files/${slug}/${file}`;
}

/**
 * Resolve item keys (in order) into runtime questions. Keys whose source is
 * gone (pack deleted, index out of range, own question removed) are skipped.
 * Every pack is read once; the resolved packs come back too so the quiz can
 * register them for question feedback.
 */
export async function resolveLinkItems(
  packsDir: string,
  slug: string,
  items: string[],
  own: KvizLinkOwnQuestion[]
): Promise<{ resolved: ResolvedLinkQuestion[]; packs: ResolvedQuizPack[] }> {
  const packIds = new Set<string>();
  for (const key of items) {
    if (key.startsWith('pack:')) packIds.add(key.split(':')[1]);
  }
  const packs = new Map<string, ResolvedQuizPack>();
  await Promise.all(
    [...packIds].map(async (id) => {
      const pack = packsDir ? await resolveQuizPack(packsDir, id) : null;
      if (pack) packs.set(id, pack);
    })
  );
  const ownById = new Map(own.map((o) => [o.id, o]));

  const resolved: ResolvedLinkQuestion[] = [];
  for (const key of items) {
    const parts = key.split(':');
    let question: KvizQuestionFull | undefined;
    if (parts[0] === 'pack') {
      question = packs.get(parts[1])?.questions[Number(parts[2])];
    } else if (parts[0] === 'bank') {
      question = QUIZ_QUESTION_BANK[Number(parts[1])];
    } else if (parts[0] === 'own') {
      const o = ownById.get(parts[1]);
      if (o) {
        question = importQuestionsToRuntime(
          { questions: [o.question] },
          `own-${o.id}`,
          (file) => kvizLinkFileUrl(slug, file)
        )[0];
      }
    }
    if (question) resolved.push({ key, question });
  }
  return { resolved, packs: [...packs.values()] };
}

/** Per-type counts of the questions that still resolve. */
export function countTypes(
  resolved: ResolvedLinkQuestion[]
): Partial<Record<KvizQuestionType, number>> {
  const types: Partial<Record<KvizQuestionType, number>> = {};
  for (const r of resolved) types[r.question.type] = (types[r.question.type] ?? 0) + 1;
  return types;
}

// ---- Public question bank (the editor's picker) ----------------------------

export interface KvizBankPreview {
  key: string;
  packId: string;
  type: KvizQuestionType;
  text: string;
  /**
   * What the question shows, never what it answers: the options without the
   * correct one marked, the emoji riddle, the visible part of a quote, the
   * slider range. The bank is public (anyone can open a link editor), and the
   * same questions run in ordinary Kviz games — answers stay server-side.
   */
  hint: string;
  media?: 'slika' | 'audio' | 'video';
}

export interface KvizBankPack {
  id: string;
  name: string;
  count: number;
}

function previewOf(q: KvizQuestionFull): { hint: string; media?: KvizBankPreview['media'] } {
  switch (q.type) {
    case 'obicno':
    case 'uljez':
    case 'audio':
    case 'video':
      return {
        hint: q.options.map((o) => o.text).join(' · '),
        media: q.type === 'audio' ? 'audio' : q.type === 'video' ? 'video' : q.imageUrl ? 'slika' : undefined,
      };
    case 'broj':
      return {
        hint: `${q.min}–${q.max}${q.unit ? ' ' + q.unit : ''}`,
        media: q.imageUrl ? 'slika' : undefined,
      };
    case 'emoji':
      return { hint: q.emojis + (q.category ? ` · ${q.category}` : '') };
    case 'dopuna':
      return { hint: `„${q.quote} …"` };
    case 'piksel':
      return { hint: 'slika se izoštrava', media: 'slika' };
    case 'anagram':
      return { hint: 'premeštena slova' };
    case 'redosled':
      return { hint: `${q.items.length} pojmova za ređanje` };
    case 'domino':
      return { hint: `${q.items.length} stavki · ${q.lowerLabel}/${q.higherLabel}` };
    case 'matrica':
      return { hint: q.cells.join(' · ') };
    case 'geo':
      return { hint: q.caption ?? 'pin na mapi', media: q.imageUrl ? 'slika' : undefined };
  }
}

let bankCache: { at: number; data: { packs: KvizBankPack[]; questions: KvizBankPreview[] } } | null =
  null;
const BANK_CACHE_MS = 60_000;

/** Every question a link can pick, grouped by pack — answer-free. */
export async function buildPublicBank(
  packsDir: string
): Promise<{ packs: KvizBankPack[]; questions: KvizBankPreview[] }> {
  if (bankCache && Date.now() - bankCache.at < BANK_CACHE_MS) return bankCache.data;

  const packs: KvizBankPack[] = [];
  const questions: KvizBankPreview[] = [];
  const summaries = packsDir ? await listQuizPackSummaries(packsDir) : [];
  for (const s of summaries) {
    const pack = await resolveQuizPack(packsDir, s.id);
    if (!pack) continue;
    packs.push({ id: pack.id, name: pack.name, count: pack.questions.length });
    pack.questions.forEach((q, i) => {
      questions.push({ key: `pack:${pack.id}:${i}`, packId: pack.id, type: q.type, text: q.text, ...previewOf(q) });
    });
  }
  packs.push({ id: KVIZ_BANK_PACK_ID, name: 'Ugrađena pitanja', count: QUIZ_QUESTION_BANK.length });
  QUIZ_QUESTION_BANK.forEach((q, i) => {
    questions.push({ key: `bank:${i}`, packId: KVIZ_BANK_PACK_ID, type: q.type, text: q.text, ...previewOf(q) });
  });

  const data = { packs, questions };
  bankCache = { at: Date.now(), data };
  return data;
}
