import { create } from 'zustand';

const STORAGE_KEY = 'igra-fibbage-config';

/**
 * Question source for the next Lažov game. Only ids travel on
 * `host:start-game` — a Lažov manifest carries the answers, so the server
 * resolves the questions from disk (same split as kviz).
 *
 * `selectedPackIds` null = "all packs" (the default, so a newly added pack is
 * picked up without touching this screen). `selectedCategories` null = every
 * category.
 */
interface StoredState {
  selectedPackIds?: string[] | null;
  selectedCategories?: string[] | null;
}

function loadFromStorage(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(state: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode / quota — the selection just won't survive a reload.
  }
}

export interface FibbagePackSummary {
  id: string;
  fileName: string;
  name: string;
  description?: string;
  count: number;
  categories: string[];
}

interface FibbageConfigState {
  packs: FibbagePackSummary[];
  packsLoaded: boolean;
  selectedPackIds: string[] | null;
  selectedCategories: string[] | null;
  setPacks: (packs: FibbagePackSummary[]) => void;
  setSelectedPackIds: (ids: string[] | null) => void;
  setSelectedCategories: (cats: string[] | null) => void;
}

const stored = loadFromStorage();

export const useFibbageConfigStore = create<FibbageConfigState>((set, get) => ({
  packs: [],
  packsLoaded: false,
  selectedPackIds: stored?.selectedPackIds ?? null,
  selectedCategories: stored?.selectedCategories ?? null,
  setPacks: (packs) => set({ packs, packsLoaded: true }),
  setSelectedPackIds: (ids) => {
    set({ selectedPackIds: ids });
    persist({ selectedPackIds: ids, selectedCategories: get().selectedCategories });
  },
  setSelectedCategories: (cats) => {
    set({ selectedCategories: cats });
    persist({ selectedPackIds: get().selectedPackIds, selectedCategories: cats });
  },
}));

/** null (= all) resolves to every pack id; an explicit list passes through. */
export function effectiveFibbagePackIds(
  packs: FibbagePackSummary[],
  selected: string[] | null
): string[] {
  if (selected === null) return packs.map((p) => p.id);
  return selected.filter((id) => packs.some((p) => p.id === id));
}

/** Distinct categories across the selected packs, in first-seen order. */
export function fibbageCategoriesOf(
  packs: FibbagePackSummary[],
  selectedPackIds: string[] | null
): string[] {
  const ids = new Set(effectiveFibbagePackIds(packs, selectedPackIds));
  const out: string[] = [];
  for (const p of packs) {
    if (!ids.has(p.id)) continue;
    for (const c of p.categories) if (!out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * Upper bound on how many questions the chosen packs can offer. Exact only
 * when no category filter is on — a per-category count would mean shipping
 * the whole manifest to the client, which is exactly what we avoid.
 */
export function fibbageQuestionCount(
  packs: FibbagePackSummary[],
  selectedPackIds: string[] | null
): number {
  const ids = new Set(effectiveFibbagePackIds(packs, selectedPackIds));
  return packs.reduce((sum, p) => (ids.has(p.id) ? sum + p.count : sum), 0);
}
