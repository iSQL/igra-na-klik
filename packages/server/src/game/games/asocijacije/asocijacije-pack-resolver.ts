import path from 'path';
import { readFile, readdir } from 'fs/promises';
import { readFileSync } from 'fs';
import type { AsocijacijePackSummary, AsocijacijePuzzle } from '@igra/shared';
import {
  parseAsocijacijePack,
  summarizeAsocijacijePack,
} from '@igra/shared';

const PACK_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Read every <name>.json in packsDir and return answer-free summaries. Skips
 * files that fail to read so one bad pack doesn't break the API. Malformed
 * packs are still listed (with visibleInGame=false + error) so the admin sees
 * why — same lax-read policy as the other content games.
 */
export async function listAsocijacijePackSummaries(
  packsDir: string
): Promise<AsocijacijePackSummary[]> {
  let entries;
  try {
    entries = await readdir(packsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const summaries: AsocijacijePackSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const id = entry.name.replace(/\.json$/i, '');
    if (!PACK_ID_RE.test(id)) continue;
    try {
      const raw = await readFile(path.join(packsDir, entry.name), 'utf-8');
      summaries.push(summarizeAsocijacijePack(id, JSON.parse(raw)));
    } catch {
      summaries.push({
        id,
        name: id,
        puzzleCount: 0,
        kvizPuzzleCount: 0,
        visibleInGame: false,
        error: 'Neispravan JSON',
      });
    }
  }
  summaries.sort((a, b) => a.id.localeCompare(b.id));
  return summaries;
}

/** Load one pack by id, validated. Returns its puzzles (with answers), or null. */
export async function resolveAsocijacijePack(
  packsDir: string,
  packId: string
): Promise<AsocijacijePuzzle[] | null> {
  if (!PACK_ID_RE.test(packId)) return null;
  let raw: string;
  try {
    raw = await readFile(path.join(packsDir, `${packId}.json`), 'utf-8');
  } catch {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const { pack } = parseAsocijacijePack(json, { id: packId });
  return pack ? pack.puzzles : null;
}

/**
 * Synchronous pack load used at game start (small JSON, one-time read).
 * Returns the pack's puzzles, or null on missing/invalid file.
 */
export function resolveAsocijacijePackSync(
  packsDir: string,
  packId: string
): AsocijacijePuzzle[] | null {
  if (!PACK_ID_RE.test(packId)) return null;
  let raw: string;
  try {
    raw = readFileSync(path.join(packsDir, `${packId}.json`), 'utf-8');
  } catch {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const { pack } = parseAsocijacijePack(json, { id: packId });
  return pack ? pack.puzzles : null;
}
