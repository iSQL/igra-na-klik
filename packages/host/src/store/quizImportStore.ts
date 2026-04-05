import { create } from 'zustand';
import type { QuizImportQuestion } from '@igra/shared';

const STORAGE_KEY = 'igra-quiz-custom';

interface StoredPack {
  fileName: string;
  questions: QuizImportQuestion[];
}

function loadFromStorage(): StoredPack | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPack;
    if (
      parsed &&
      typeof parsed.fileName === 'string' &&
      Array.isArray(parsed.questions)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

interface QuizImportStore {
  customQuestions: QuizImportQuestion[] | null;
  fileName: string | null;
  setCustom: (questions: QuizImportQuestion[], fileName: string) => void;
  clear: () => void;
}

const initial = loadFromStorage();

export const useQuizImportStore = create<QuizImportStore>((set) => ({
  customQuestions: initial?.questions ?? null,
  fileName: initial?.fileName ?? null,
  setCustom: (questions, fileName) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fileName, questions } satisfies StoredPack)
    );
    set({ customQuestions: questions, fileName });
  },
  clear: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ customQuestions: null, fileName: null });
  },
}));
