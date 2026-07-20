import { create } from 'zustand';
import type {
  KvizCategoryId,
  KvizImportQuestion,
  KvizQuestionType,
} from '@igra/shared';

const STORAGE_KEY = 'igra-quiz-custom';

export const KVIZ_ALL_TYPES: KvizQuestionType[] = [
  // (domino/matrica appended below in the same order the filter chips render)
  'obicno',
  'audio',
  'video',
  'geo',
  'broj',
  'emoji',
  'uljez',
  'dopuna',
  'piksel',
  'anagram',
  'redosled',
  'domino',
  'matrica',
];

/**
 * Question source for the next Kviz game:
 *  - packs — a multi-select of server packs (incl. the built-in bank as the
 *    pseudo-pack '__bank__'); only quizPackIds travel, the server resolves
 *    questions from disk (answers never reach clients). `selectedPackIds`
 *    null = "all packs" (the default — newly added packs auto-include).
 *  - 'file' — a locally uploaded .json, inlined as customQuestions
 *    (mutually exclusive with the pack selection).
 * `selectedTypes` null = all question types.
 */
interface StoredState {
  selectedPackIds?: string[] | null;
  selectedTypes?: KvizQuestionType[] | null;
  fileName?: string | null;
  questions?: KvizImportQuestion[] | null;
}

function loadFromStorage(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState & { packId?: unknown };
    if (!parsed || typeof parsed !== 'object') return null;
    // Legacy single-pack shape ({packId, packName}) — reset to "all packs".
    if (parsed.packId !== undefined) return null;
    if (
      parsed.selectedTypes != null &&
      (!Array.isArray(parsed.selectedTypes) ||
        parsed.selectedTypes.some((t) => !KVIZ_ALL_TYPES.includes(t)))
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface QuizPackSummary {
  id: string;
  fileName: string;
  name: string;
  description?: string;
  category?: KvizCategoryId;
  count: number;
  types: Partial<Record<KvizQuestionType, number>>;
}

interface QuizImportStore {
  /** Server pack summaries (filled by the picker's fetch; not persisted). */
  packs: QuizPackSummary[];
  /** Checked pack ids; null = all (default). */
  selectedPackIds: string[] | null;
  /** Checked question types; null = all (default). */
  selectedTypes: KvizQuestionType[] | null;
  /** Locally uploaded questions (inline import). */
  customQuestions: KvizImportQuestion[] | null;
  fileName: string | null;
  setPacks: (packs: QuizPackSummary[]) => void;
  togglePack: (packId: string) => void;
  toggleType: (type: KvizQuestionType) => void;
  /** Bulk set: null = all, [] = none. */
  setSelectedPackIds: (v: string[] | null) => void;
  setSelectedTypes: (v: KvizQuestionType[] | null) => void;
  setCustom: (questions: KvizImportQuestion[], fileName: string) => void;
  clearCustom: () => void;
}

const initial = loadFromStorage();

function persist(state: {
  selectedPackIds: string[] | null;
  selectedTypes: KvizQuestionType[] | null;
  fileName?: string | null;
  questions?: KvizImportQuestion[] | null;
}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Effective checked pack ids given the loaded pack list (null = all). */
export function effectivePackIds(
  packs: QuizPackSummary[],
  selected: string[] | null
): string[] {
  const all = packs.map((p) => p.id);
  if (selected === null) return all;
  return selected.filter((id) => all.includes(id));
}

/** How many questions the current pack × type selection yields. */
export function availableQuestionCount(
  packs: QuizPackSummary[],
  selectedPackIds: string[] | null,
  selectedTypes: KvizQuestionType[] | null
): number {
  const ids = new Set(effectivePackIds(packs, selectedPackIds));
  const types = selectedTypes ?? KVIZ_ALL_TYPES;
  let n = 0;
  for (const p of packs) {
    if (!ids.has(p.id)) continue;
    for (const t of types) n += p.types[t] ?? 0;
  }
  return n;
}

export const useQuizImportStore = create<QuizImportStore>((set, get) => ({
  packs: [],
  selectedPackIds: initial?.selectedPackIds ?? null,
  selectedTypes: initial?.selectedTypes ?? null,
  customQuestions: initial?.questions ?? null,
  fileName: initial?.fileName ?? null,
  setPacks: (packs) => set({ packs }),
  togglePack: (packId) => {
    const { packs, selectedPackIds, selectedTypes, fileName, customQuestions } =
      get();
    const current = effectivePackIds(packs, selectedPackIds);
    const next = current.includes(packId)
      ? current.filter((id) => id !== packId)
      : [...current, packId];
    // Everything checked collapses back to null so new packs auto-include.
    const value = next.length === packs.length ? null : next;
    persist({
      selectedPackIds: value,
      selectedTypes,
      fileName,
      questions: customQuestions,
    });
    set({ selectedPackIds: value });
  },
  toggleType: (type) => {
    const { selectedPackIds, selectedTypes, fileName, customQuestions } = get();
    const current = selectedTypes ?? KVIZ_ALL_TYPES;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    const value = next.length === KVIZ_ALL_TYPES.length ? null : next;
    persist({
      selectedPackIds,
      selectedTypes: value,
      fileName,
      questions: customQuestions,
    });
    set({ selectedTypes: value });
  },
  setSelectedPackIds: (v) => {
    const { selectedTypes, fileName, customQuestions } = get();
    persist({
      selectedPackIds: v,
      selectedTypes,
      fileName,
      questions: customQuestions,
    });
    set({ selectedPackIds: v });
  },
  setSelectedTypes: (v) => {
    const { selectedPackIds, fileName, customQuestions } = get();
    persist({
      selectedPackIds,
      selectedTypes: v,
      fileName,
      questions: customQuestions,
    });
    set({ selectedTypes: v });
  },
  setCustom: (questions, fileName) => {
    const { selectedPackIds, selectedTypes } = get();
    persist({ selectedPackIds, selectedTypes, fileName, questions });
    set({ customQuestions: questions, fileName });
  },
  clearCustom: () => {
    const { selectedPackIds, selectedTypes } = get();
    persist({ selectedPackIds, selectedTypes });
    set({ customQuestions: null, fileName: null });
  },
}));
