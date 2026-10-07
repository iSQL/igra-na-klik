import type { KvizQuestionFull } from '@igra/shared';
import { formatBrojValue } from '@igra/shared';
import type {
  KvizLinkAnswer,
  KvizLinkGameQuestion,
} from '../../../kviz-links/kviz-link-store.js';

/**
 * Kviz link statistics: what a player answered, kept per question in
 * stats.json, plus the "Tvoji odgovori" recap each phone gets about itself.
 */

/** Text that identifies the question — the emoji riddle and the quote are the question. */
export function linkQuestionLabel(q: KvizQuestionFull): string {
  if (q.type === 'emoji') return `${q.emojis} ${q.text}`;
  if (q.type === 'dopuna') return `${q.quote} …`;
  return q.text;
}

/** The question as played, with its options and answer, for stats.json. */
export function snapshotLinkQuestion(q: KvizQuestionFull, key: string): KvizLinkGameQuestion {
  const base: KvizLinkGameQuestion = { key, text: linkQuestionLabel(q), type: q.type };
  switch (q.type) {
    case 'obicno':
    case 'audio':
    case 'video':
    case 'uljez': {
      const options: string[] = [];
      for (const o of q.options) options[o.index] = o.text;
      return { ...base, options, correct: q.correctIndex };
    }
    case 'broj':
      return {
        ...base,
        correct: q.answer,
        min: q.min,
        max: q.max,
        ...(q.unit ? { unit: q.unit } : {}),
        ...(q.valueType ? { valueType: q.valueType } : {}),
      };
    case 'emoji':
    case 'dopuna':
    case 'piksel':
    case 'anagram':
      return { ...base, correct: q.answer };
    case 'redosled':
      return { ...base, options: inCorrectOrder(q.items, q.order) };
    case 'matrica':
      return { ...base, options: q.cells, correct: q.correct };
    case 'domino':
      return q.unit ? { ...base, unit: q.unit } : base;
    case 'geo':
      return base;
  }
}

function inCorrectOrder(items: string[], order: number[]): string[] {
  const out: string[] = [];
  items.forEach((item, i) => (out[order[i]] = item));
  return out;
}

/** One answer, formatted for the phone's recap. */
export function describeLinkAnswer(q: KvizQuestionFull, a: KvizLinkAnswer): string {
  switch (a.k) {
    case 'opt':
      return 'options' in q ? (q.options.find((o) => o.index === a.i)?.text ?? '?') : '?';
    case 'num':
      return q.type === 'broj' ? formatBrojValue(a.v, q.unit, q.valueType) : String(a.v);
    case 'txt':
      return a.v;
    case 'geo':
      return `promašaj ${String(a.km).replace('.', ',')} km`;
    case 'order':
      return `${a.hits}/${a.of} na mestu`;
    case 'domino':
      return `niz ${a.streak}/${a.of}`;
    case 'cells':
      return q.type === 'matrica' ? a.v.map((i) => q.cells[i]).join(' · ') : '';
  }
}

/** The correct answer, formatted; undefined where there is no single one. */
export function describeLinkCorrect(q: KvizQuestionFull): string | undefined {
  switch (q.type) {
    case 'obicno':
    case 'audio':
    case 'video':
    case 'uljez':
      return q.options.find((o) => o.index === q.correctIndex)?.text;
    case 'broj':
      return formatBrojValue(q.answer, q.unit, q.valueType);
    case 'emoji':
    case 'dopuna':
    case 'piksel':
    case 'anagram':
      return q.answer;
    case 'redosled':
      return inCorrectOrder(q.items, q.order).join(' → ');
    case 'matrica':
      return q.correct.map((i) => q.cells[i]).join(' · ');
    default:
      return undefined;
  }
}
