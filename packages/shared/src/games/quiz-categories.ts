/**
 * Kviz pack categories — a fixed, shared taxonomy used to group packs both in
 * the admin editor and in the in-game pack picker. A pack carries an optional
 * `category` id in its manifest; anything missing or unknown falls back to
 * 'ostalo' on display (reads stay lax — an unknown value is never an error).
 *
 * The five top-level categories double as the game's category → subcategory
 * hierarchy: each pack is a "subcategory" that shows up grouped under its
 * category in the picker (e.g. "Fudbal" and "Gejming" both under Sport).
 */
export type KvizCategoryId =
  | 'opste'
  | 'nauka'
  | 'pop'
  | 'sport'
  | 'umetnost'
  | 'ostalo';

export interface KvizCategory {
  id: KvizCategoryId;
  label: string;
  icon: string;
}

/** Display order = section order in the picker. 'ostalo' is the last fallback. */
export const KVIZ_CATEGORIES: KvizCategory[] = [
  { id: 'opste', label: 'Opšte znanje', icon: '🧠' },
  { id: 'nauka', label: 'Nauka i priroda', icon: '🔬' },
  { id: 'pop', label: 'Pop kultura i zabava', icon: '🎬' },
  { id: 'sport', label: 'Sport i razonoda', icon: '⚽' },
  { id: 'umetnost', label: 'Umetnost i književnost', icon: '🎨' },
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
