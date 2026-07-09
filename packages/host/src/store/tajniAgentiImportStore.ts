import { create } from 'zustand';
import type { TajniAgentiImportPack } from '@igra/shared';

const STORAGE_KEY = 'igra-tajni-agenti-custom';

interface StoredPack {
  fileName: string;
  pack: TajniAgentiImportPack;
}

interface StoredState {
  customPack: StoredPack | null;
}

function loadFromStorage(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { customPack: null };
    const parsed = JSON.parse(raw) as Partial<StoredState> & {
      // Backwards-compat: previous shape was StoredPack at the top level.
      fileName?: string;
      pack?: TajniAgentiImportPack;
    };

    let customPack: StoredPack | null = null;
    if (
      parsed.customPack &&
      typeof parsed.customPack.fileName === 'string' &&
      parsed.customPack.pack &&
      Array.isArray(parsed.customPack.pack.words)
    ) {
      customPack = parsed.customPack;
    } else if (
      typeof parsed.fileName === 'string' &&
      parsed.pack &&
      Array.isArray(parsed.pack.words)
    ) {
      customPack = { fileName: parsed.fileName, pack: parsed.pack };
    }

    return { customPack };
  } catch {
    return { customPack: null };
  }
}

function saveToStorage(state: StoredState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

interface TajniAgentiImportStore {
  customPack: TajniAgentiImportPack | null;
  fileName: string | null;
  setCustom: (pack: TajniAgentiImportPack, fileName: string) => void;
  clear: () => void;
}

const initial = loadFromStorage();

export const useTajniAgentiImportStore = create<TajniAgentiImportStore>(
  (set) => ({
    customPack: initial.customPack?.pack ?? null,
    fileName: initial.customPack?.fileName ?? null,
    setCustom: (pack, fileName) => {
      saveToStorage({ customPack: { fileName, pack } });
      set({ customPack: pack, fileName });
    },
    clear: () => {
      saveToStorage({ customPack: null });
      set({ customPack: null, fileName: null });
    },
  })
);
