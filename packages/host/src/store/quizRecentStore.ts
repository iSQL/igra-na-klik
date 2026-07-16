/**
 * Recently-used Kviz packs — a per-device localStorage list of pack ids,
 * most-recent first. Recorded when a Kviz game starts (see GameSelectScreen)
 * and surfaced as the "🕘 Nedavno korišćeno" strip at the top of the picker.
 */
const STORAGE_KEY = 'igra-quiz-recent';
const MAX_STORED = 10;

export function getRecentPackIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

/** Prepend the given pack ids (dedup, most-recent first), capped. */
export function recordRecentPacks(ids: string[]): void {
  if (!ids.length) return;
  try {
    const prev = getRecentPackIds();
    const merged = [...ids, ...prev.filter((id) => !ids.includes(id))];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged.slice(0, MAX_STORED)));
  } catch {
    // Ignore storage failures (private mode etc.).
  }
}
