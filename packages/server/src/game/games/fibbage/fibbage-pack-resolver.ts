import path from 'path';
import { readFile, readdir } from 'fs/promises';
import type { FibbageQuestion } from '@igra/shared';
import {
  fibbagePackCategories,
  fibbagePackToRuntime,
  parseFibbagePack,
} from '@igra/shared';

/**
 * Lažov packs live in `fibbage-packs/<id>.json`. A manifest carries the
 * answers, so this module is the only thing that ever reads them: the public
 * API serves `FibbagePackSummary` (no questions), and the chosen ids ride
 * `host:start-game` to be resolved here — the same split kviz uses.
 */

export interface FibbagePackSummary {
  id: string;
  fileName: string;
  name: string;
  description?: string;
  count: number;
  /** Distinct categories, so the game-select filter can be built client-side. */
  categories: string[];
}

export interface ResolvedFibbagePack {
  id: string;
  name: string;
  questions: FibbageQuestion[];
}

const PACK_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Read every <name>.json directly inside packsDir, validate strictly, and
 * return public-safe summaries. A file that fails validation is skipped so one
 * bad pack can't break the picker.
 */
export async function listFibbagePackSummaries(
  packsDir: string
): Promise<FibbagePackSummary[]> {
  let entries;
  try {
    entries = await readdir(packsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const summaries: FibbagePackSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const id = entry.name.replace(/\.json$/i, '');
    if (!PACK_ID_RE.test(id)) continue;
    try {
      const raw = await readFile(path.join(packsDir, entry.name), 'utf-8');
      const parsed = parseFibbagePack(JSON.parse(raw));
      if (!parsed.ok) continue;
      summaries.push({
        id,
        fileName: entry.name,
        name: parsed.pack.name ?? id,
        description: parsed.pack.description,
        count: parsed.pack.questions.length,
        categories: fibbagePackCategories(parsed.pack),
      });
    } catch {
      // Ignore malformed file and continue.
    }
  }

  summaries.sort((a, b) => a.id.localeCompare(b.id));
  return summaries;
}

/** Load one pack by id. Returns `null` if it's missing or fails validation. */
export async function resolveFibbagePack(
  packsDir: string,
  packId: string
): Promise<ResolvedFibbagePack | null> {
  // Defense-in-depth: refuse anything that could escape packsDir.
  if (!PACK_ID_RE.test(packId)) return null;

  let raw: string;
  try {
    raw = await readFile(path.join(packsDir, `${packId}.json`), 'utf-8');
  } catch {
    return null;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = parseFibbagePack(parsedJson);
  if (!parsed.ok) return null;

  return {
    id: packId,
    name: parsed.pack.name ?? packId,
    questions: fibbagePackToRuntime(parsed.pack, `pack-${packId}`),
  };
}

/**
 * Pool the questions of several packs into one list, dropping cross-pack
 * duplicates by question text (two packs may well carry the same classic).
 */
export async function resolveFibbageQuestions(
  packsDir: string,
  packIds: string[],
  categories?: string[] | null
): Promise<FibbageQuestion[]> {
  const wanted =
    categories && categories.length > 0
      ? new Set(categories.map((c) => c.toLowerCase()))
      : null;

  const pooled: FibbageQuestion[] = [];
  const seen = new Set<string>();

  for (const id of packIds) {
    const pack = await resolveFibbagePack(packsDir, id);
    if (!pack) continue;
    for (const q of pack.questions) {
      if (wanted && !wanted.has((q.category ?? '').toLowerCase())) continue;
      const key = q.text.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      pooled.push(q);
    }
  }

  return pooled;
}
