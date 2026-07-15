import { create } from 'zustand';
import type { KvizImportQuestion } from '@igra/shared';

const STORAGE_KEY = 'igra-quiz-custom';

/**
 * Question source for the next Kviz game:
 *  - 'pack' — a server pack chosen by id; only quizPackId travels, the
 *    server resolves questions from disk (answers never reach clients).
 *  - 'file' — a locally uploaded .json, inlined as customQuestions.
 *  - neither (both null) — the built-in bank.
 */
interface StoredPack {
  packId?: string | null;
  packName?: string | null;
  fileName?: string | null;
  questions?: KvizImportQuestion[] | null;
}

function loadFromStorage(): StoredPack | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPack;
    if (!parsed || typeof parsed !== 'object') return null;
    // Legacy shape ({fileName, questions}) still loads as a file import.
    return parsed;
  } catch {
    return null;
  }
}

interface QuizImportStore {
  /** Selected server pack (questions stay server-side). */
  packId: string | null;
  packName: string | null;
  /** Locally uploaded questions (inline import). */
  customQuestions: KvizImportQuestion[] | null;
  fileName: string | null;
  setPack: (packId: string, packName: string) => void;
  setCustom: (questions: KvizImportQuestion[], fileName: string) => void;
  clear: () => void;
}

const initial = loadFromStorage();

function persist(state: StoredPack) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const useQuizImportStore = create<QuizImportStore>((set) => ({
  packId: initial?.packId ?? null,
  packName: initial?.packName ?? null,
  customQuestions: initial?.questions ?? null,
  fileName: initial?.fileName ?? null,
  setPack: (packId, packName) => {
    persist({ packId, packName });
    set({ packId, packName, customQuestions: null, fileName: null });
  },
  setCustom: (questions, fileName) => {
    persist({ fileName, questions });
    set({ customQuestions: questions, fileName, packId: null, packName: null });
  },
  clear: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ customQuestions: null, fileName: null, packId: null, packName: null });
  },
}));
