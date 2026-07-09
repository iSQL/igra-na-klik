import { readFileSync } from 'fs';
import {
  resolveGameTimings,
  parseTimingOverrides,
  type TimingOverrides,
} from '@igra/shared';
import { writeJsonAtomic } from '../admin/admin-common.js';

/**
 * Server-side store for the admin-configurable "wait" timings (scope B).
 * Backed by a single JSON file (TIMING_CONFIG_FILE, default `timing-config.json`
 * at the repo root). The file holds only overrides that differ from the code
 * defaults, so an empty/missing file means "use every game's built-in timing".
 *
 * Loaded once (lazily) and cached; admin writes go through `setTimingOverrides`
 * which rewrites the file atomically and refreshes the cache. Game modules read
 * their slice via `getGameTimings(gameId)` at `onStart` — see the resolver in
 * @igra/shared. Only the overrides are returned; each module keeps its own
 * constant as the runtime fallback.
 */

let configFile: string | null = null;
let cache: TimingOverrides | null = null;

/** Point the store at its JSON file (called once from the server bootstrap). */
export function initTimingConfig(filePath: string): void {
  configFile = filePath;
  cache = null;
  load();
}

function load(): TimingOverrides {
  if (cache) return cache;
  if (!configFile) {
    cache = {};
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(configFile, 'utf-8'));
    const parsed = parseTimingOverrides(raw);
    cache = parsed.ok ? parsed.overrides : {};
  } catch {
    // Missing file / bad JSON → no overrides (all defaults).
    cache = {};
  }
  return cache;
}

export function getTimingOverrides(): TimingOverrides {
  return load();
}

export async function setTimingOverrides(next: TimingOverrides): Promise<void> {
  if (!configFile) throw new Error('Timing config nije inicijalizovan.');
  await writeJsonAtomic(configFile, next);
  cache = next;
}

/** Clamped override map for one game (`{ key: seconds }`), overrides only. */
export function getGameTimings(gameId: string): Record<string, number> {
  return resolveGameTimings(load(), gameId);
}
