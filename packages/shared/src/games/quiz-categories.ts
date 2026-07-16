/**
 * Kviz pack categories — a fixed, shared taxonomy used to group packs both in
 * the admin editor and in the in-game pack picker. A pack carries an optional
 * `category` id in its manifest; anything missing or unknown falls back to
 * 'ostalo' on display (reads stay lax — an unknown value is never an error).
 */
export type KvizCategoryId =
  | 'skola'
  | 'pop'
  | 'geo'
  | 'hrana'
  | 'sport'
  | 'nauka'
  | 'opste'
  | 'zabava'
  | 'ostalo';

export interface KvizCategory {
  id: KvizCategoryId;
  label: string;
  icon: string;
}

/** Display order = section order in the picker. 'ostalo' is the last fallback. */
export const KVIZ_CATEGORIES: KvizCategory[] = [
  { id: 'skola', label: 'Škola', icon: '📚' },
  { id: 'pop', label: 'Pop kultura', icon: '🎬' },
  { id: 'geo', label: 'Geografija', icon: '🗺️' },
  { id: 'hrana', label: 'Hrana & piće', icon: '🍲' },
  { id: 'sport', label: 'Sport', icon: '⚽' },
  { id: 'nauka', label: 'Nauka', icon: '🔬' },
  { id: 'opste', label: 'Opšte znanje', icon: '🧠' },
  { id: 'zabava', label: 'Zabava & igre', icon: '🎮' },
  { id: 'ostalo', label: 'Ostalo', icon: '📦' },
];

export const KVIZ_UNCATEGORIZED_ID: KvizCategoryId = 'ostalo';

export const KVIZ_CATEGORY_IDS = new Set<string>(KVIZ_CATEGORIES.map((c) => c.id));

const KVIZ_CATEGORY_BY_ID = new Map<string, KvizCategory>(
  KVIZ_CATEGORIES.map((c) => [c.id, c])
);

/** Resolve a raw category id to a category, falling back to 'ostalo'. */
export function kvizCategory(id: string | undefined): KvizCategory {
  return (
    (id && KVIZ_CATEGORY_BY_ID.get(id)) ||
    KVIZ_CATEGORY_BY_ID.get(KVIZ_UNCATEGORIZED_ID)!
  );
}
