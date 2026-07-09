import path from 'path';
import { readFile, readdir } from 'fs/promises';
import type { PogodiBrojQuestion } from '@igra/shared';
import { parsePogodiBrojImport } from '@igra/shared';

export interface ResolvedPogodiBrojPackSummary {
  id: string;
  fileName: string;
  name: string;
  description?: string;
  count: number;
}

export interface ResolvedPogodiBrojPack {
  id: string;
  name: string;
  description?: string;
  /** Questions with `imageFile` resolved to a public `/pogodi-images/…` URL. */
  questions: (PogodiBrojQuestion & { imageUrl?: string })[];
}

/**
 * Read every <name>.json directly inside packsDir, validate each one with
 * `parsePogodiBrojImport`, and return a public-safe summary list. Skips any
 * file that fails validation so one bad pack doesn't break the API.
 */
export async function listPogodiBrojPacks(
  packsDir: string
): Promise<ResolvedPogodiBrojPackSummary[]> {
  let entries;
  try {
    entries = await readdir(packsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const summaries: ResolvedPogodiBrojPackSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    try {
      const raw = await readFile(path.join(packsDir, entry.name), 'utf-8');
      const parsed = parsePogodiBrojImport(JSON.parse(raw));
      if (!parsed.ok) continue;
      summaries.push({
        id: entry.name.replace(/\.json$/i, ''),
        fileName: entry.name,
        name: parsed.manifest.name,
        description: parsed.manifest.description,
        count: parsed.manifest.questions.length,
      });
    } catch {
      // Ignore malformed file and continue.
    }
  }

  summaries.sort((a, b) => a.id.localeCompare(b.id));
  return summaries;
}

/**
 * Load a specific pack by id, validate it, and resolve its image references
 * to public URLs (`/pogodi-images/<id>/<file>`). Returns `null` if the pack
 * doesn't exist or fails validation.
 */
export async function resolvePogodiBrojPack(
  packsDir: string,
  packId: string
): Promise<ResolvedPogodiBrojPack | null> {
  // Defense-in-depth: refuse anything that could escape packsDir.
  if (!/^[a-zA-Z0-9_-]+$/.test(packId)) return null;

  const filePath = path.join(packsDir, `${packId}.json`);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = parsePogodiBrojImport(parsedJson);
  if (!parsed.ok) return null;

  const questions = parsed.manifest.questions.map((q) => ({
    ...q,
    imageUrl: q.imageFile
      ? `/pogodi-images/${packId}/${q.imageFile}`
      : undefined,
  }));

  return {
    id: packId,
    name: parsed.manifest.name,
    description: parsed.manifest.description,
    questions,
  };
}
