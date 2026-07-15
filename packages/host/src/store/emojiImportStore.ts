import { create } from 'zustand';
import type { EmojiImportPuzzle } from '@igra/shared';

const STORAGE_KEY = 'igra-emoji-custom';

interface StoredPack {
  fileName: string;
  puzzles: EmojiImportPuzzle[];
}

function loadFromStorage(): StoredPack | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPack;
    if (
      parsed &&
      typeof parsed.fileName === 'string' &&
      Array.isArray(parsed.puzzles)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

interface EmojiImportStore {
  customPuzzles: EmojiImportPuzzle[] | null;
  fileName: string | null;
  setCustom: (puzzles: EmojiImportPuzzle[], fileName: string) => void;
  clear: () => void;
}

const initial = loadFromStorage();

export const useEmojiImportStore = create<EmojiImportStore>((set) => ({
  customPuzzles: initial?.puzzles ?? null,
  fileName: initial?.fileName ?? null,
  setCustom: (puzzles, fileName) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ fileName, puzzles } satisfies StoredPack)
    );
    set({ customPuzzles: puzzles, fileName });
  },
  clear: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ customPuzzles: null, fileName: null });
  },
}));
