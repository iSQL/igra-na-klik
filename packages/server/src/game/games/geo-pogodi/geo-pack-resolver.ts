import path from 'path';
import { readFile, readdir } from 'fs/promises';
import type { GeoLocation } from '@igra/shared';
import { parseGeoPackImport } from '@igra/shared';

export interface ResolvedGeoPackSummary {
  id: string;
  fileName: string;
  name: string;
  description?: string;
  count: number;
}

export interface ResolvedGeoPack {
  id: string;
  name: string;
  description?: string;
  locations: GeoLocation[];
}

/**
 * Read every <name>.json directly inside packsDir, validate each one with
 * `parseGeoPackImport`, and return a public-safe summary list.
 *
 * Skips any file that fails validation, so one bad pack doesn't break the API.
 */
export async function listGeoPacks(
  packsDir: string
): Promise<ResolvedGeoPackSummary[]> {
  let entries;
  try {
    entries = await readdir(packsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const summaries: ResolvedGeoPackSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    try {
      const raw = await readFile(path.join(packsDir, entry.name), 'utf-8');
      const parsed = parseGeoPackImport(JSON.parse(raw));
      if (!parsed.ok) continue;
      summaries.push({
        id: entry.name.replace(/\.json$/i, ''),
        fileName: entry.name,
        name: parsed.manifest.name,
        description: parsed.manifest.description,
        count: parsed.manifest.locations.length,
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
 * to public URLs (`/geo-images/<id>/<file>`). Returns `null` if the pack
 * doesn't exist or fails validation.
 */
export async function resolveGeoPack(
  packsDir: string,
  packId: string
): Promise<ResolvedGeoPack | null> {
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
  const parsed = parseGeoPackImport(parsedJson);
  if (!parsed.ok) return null;

  const locations: GeoLocation[] = parsed.manifest.locations.map((loc, i) => ({
    id: `${packId}-${i + 1}`,
    imageUrl: `/geo-images/${packId}/${loc.imageFile}`,
    lat: loc.lat,
    lng: loc.lng,
    district: loc.district,
    caption: loc.caption,
  }));

  return {
    id: packId,
    name: parsed.manifest.name,
    description: parsed.manifest.description,
    locations,
  };
}
