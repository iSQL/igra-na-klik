import { create } from 'zustand';
import type {
  TajniAgentiImportPack,
  TajniAgentiScenario,
} from '@igra/shared';

const STORAGE_KEY = 'igra-tajni-agenti-custom';

interface StoredPack {
  fileName: string;
  pack: TajniAgentiImportPack;
}

interface StoredCustomScenario {
  source: 'file' | 'server';
  /** UI label (`fileName.json` or the server pack's id). */
  label: string;
  scenario: TajniAgentiScenario;
}

interface StoredState {
  customPack: StoredPack | null;
  /** Built-in scenario code typed by the host (no full object stored). */
  scenarioCode: string | null;
  /** Imported scenario from a file picker or the server's packs dir. */
  customScenario: StoredCustomScenario | null;
}

function loadFromStorage(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { customPack: null, scenarioCode: null, customScenario: null };
    }
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

    let customScenario: StoredCustomScenario | null = null;
    if (
      parsed.customScenario &&
      (parsed.customScenario.source === 'file' ||
        parsed.customScenario.source === 'server') &&
      typeof parsed.customScenario.label === 'string' &&
      parsed.customScenario.scenario &&
      Array.isArray(parsed.customScenario.scenario.cards) &&
      typeof parsed.customScenario.scenario.code === 'string' &&
      typeof parsed.customScenario.scenario.name === 'string'
    ) {
      customScenario = parsed.customScenario;
    }

    return { customPack, scenarioCode, customScenario };
  } catch {
    return { customPack: null, scenarioCode: null, customScenario: null };
  }
}

function saveToStorage(state: StoredState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

interface TajniAgentiImportStore {
  customPack: TajniAgentiImportPack | null;
  fileName: string | null;
  scenarioCode: string | null;
  customScenario: StoredCustomScenario | null;
  setCustom: (pack: TajniAgentiImportPack, fileName: string) => void;
  clear: () => void;
  setScenarioCode: (code: string | null) => void;
  setCustomScenario: (entry: StoredCustomScenario | null) => void;
}

const initial = loadFromStorage();

export const useTajniAgentiImportStore = create<TajniAgentiImportStore>(
  (set, get) => ({
    customPack: initial.customPack?.pack ?? null,
    fileName: initial.customPack?.fileName ?? null,
    scenarioCode: initial.scenarioCode,
    customScenario: initial.customScenario,
    setCustom: (pack, fileName) => {
      const next: StoredState = {
        customPack: { fileName, pack },
        scenarioCode: get().scenarioCode,
        customScenario: get().customScenario,
      };
      saveToStorage(next);
      set({ customPack: pack, fileName });
    },
    clear: () => {
      const next: StoredState = {
        customPack: null,
        scenarioCode: get().scenarioCode,
        customScenario: get().customScenario,
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
        // Activating a code clears any imported-object scenario so the
        // two settings can't fight each other on start.
        customScenario: normalized ? null : current.customScenario,
      };
      saveToStorage(next);
      set({
        scenarioCode: normalized,
        customScenario: next.customScenario,
      });
    },
    setCustomScenario: (entry) => {
      const current = get();
      const next: StoredState = {
        customPack: current.customPack
          ? { fileName: current.fileName ?? '', pack: current.customPack }
          : null,
        // Mutually exclusive — clear the built-in code when we activate
        // a custom scenario object.
        scenarioCode: entry ? null : current.scenarioCode,
        customScenario: entry,
      };
      saveToStorage(next);
      set({
        scenarioCode: next.scenarioCode,
        customScenario: entry,
      });
    },
  })
);
