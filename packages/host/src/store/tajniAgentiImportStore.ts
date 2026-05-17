import { create } from 'zustand';
import type { TajniAgentiImportPack } from '@igra/shared';

const STORAGE_KEY = 'igra-tajni-agenti-custom';

interface StoredPack {
  fileName: string;
  pack: TajniAgentiImportPack;
}

interface StoredState {
  customPack: StoredPack | null;
  scenarioCode: string | null;
}

function loadFromStorage(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { customPack: null, scenarioCode: null };
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

    const scenarioCode =
      typeof parsed.scenarioCode === 'string' && parsed.scenarioCode.length > 0
        ? parsed.scenarioCode
        : null;

    return { customPack, scenarioCode };
  } catch {
    return { customPack: null, scenarioCode: null };
  }
}

function saveToStorage(state: StoredState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

interface TajniAgentiImportStore {
  customPack: TajniAgentiImportPack | null;
  fileName: string | null;
  scenarioCode: string | null;
  setCustom: (pack: TajniAgentiImportPack, fileName: string) => void;
  clear: () => void;
  setScenarioCode: (code: string | null) => void;
}

const initial = loadFromStorage();

export const useTajniAgentiImportStore = create<TajniAgentiImportStore>(
  (set, get) => ({
    customPack: initial.customPack?.pack ?? null,
    fileName: initial.customPack?.fileName ?? null,
    scenarioCode: initial.scenarioCode,
    setCustom: (pack, fileName) => {
      const next: StoredState = {
        customPack: { fileName, pack },
        scenarioCode: get().scenarioCode,
      };
      saveToStorage(next);
      set({ customPack: pack, fileName });
    },
    clear: () => {
      const next: StoredState = {
        customPack: null,
        scenarioCode: get().scenarioCode,
      };
      saveToStorage(next);
      set({ customPack: null, fileName: null });
    },
    setScenarioCode: (code) => {
      const normalized = code && code.trim().length > 0 ? code.trim() : null;
      const current = get();
      const next: StoredState = {
        customPack: current.customPack
          ? { fileName: current.fileName ?? '', pack: current.customPack }
          : null,
        scenarioCode: normalized,
      };
      saveToStorage(next);
      set({ scenarioCode: normalized });
    },
  })
);
