import { create } from 'zustand';
import type { KoSamJaImportQuestion } from '@igra/shared';

const STORAGE_KEY = 'igra-ko-sam-ja-custom';

interface StoredPack {
  fileName: string;
  questions: KoSamJaImportQuestion[];
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

interface KoSamJaImportStore {
  customQuestions: KoSamJaImportQuestion[] | null;
  fileName: string | null;
  setCustom: (questions: KoSamJaImportQuestion[], fileName: string) => void;
  clear: () => void;
}

const initial = loadFromStorage();

export const useKoSamJaImportStore = create<KoSamJaImportStore>((set) => ({
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
