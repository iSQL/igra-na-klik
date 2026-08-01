import path from 'path';
import { readFile, readdir } from 'fs/promises';
import { existsSync, readdirSync, readFileSync } from 'fs';
import type { BitkaMapSummary, BitkaMapView } from '@igra/shared';
import { labelAnchor, parseBitkaMap, summarizeBitkaMap } from '@igra/shared';

const MAP_ID_RE = /^[a-zA-Z0-9_-]+$/;

/** Javna putanja pod kojom se služe slike mapa (vidi index.ts). */
export const BITKA_FILES_ROUTE = '/bitka-files';

/**
 * Sažeci svih mapa iz `mapsDir`. Neispravne mape se i dalje prijavljuju (sa
 * `visibleInGame: false` i porukom) da bi se u adminu videlo zašto ne rade —
 * ista popustljiva politika kao kod ostalih sadržajnih tipova.
 *
 * Postojanje slike na disku može da proveri samo server, pa se tu i dodaje:
 * mapa koja u JSON-u ima `imageFile` a fajl je obrisan ne sme u igru.
 */
export async function listBitkaMapSummaries(
  mapsDir: string
): Promise<BitkaMapSummary[]> {
  let entries;
  try {
    entries = await readdir(mapsDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const summaries: BitkaMapSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const id = entry.name.replace(/\.json$/i, '');
    if (!MAP_ID_RE.test(id)) continue;
    try {
      const raw = await readFile(path.join(mapsDir, entry.name), 'utf-8');
      summaries.push(withImageCheck(mapsDir, summarizeBitkaMap(id, JSON.parse(raw))));
    } catch {
      summaries.push({
        id,
        name: id,
        territoryCount: 0,
        hasImage: false,
        visibleInGame: false,
        error: 'Neispravan JSON',
      });
    }
  }
  summaries.sort((a, b) => a.id.localeCompare(b.id));
  return summaries;
}

/** Slika navedena u manifestu mora i fizički da postoji. */
function withImageCheck(mapsDir: string, summary: BitkaMapSummary): BitkaMapSummary {
  if (!summary.visibleInGame || !summary.hasImage) return summary;
  const file = imageFileOf(mapsDir, summary.id);
  if (file && existsSync(file)) return summary;
  return {
    ...summary,
    visibleInGame: false,
    error: 'Slika mape nedostaje na disku — otpremi je ponovo',
  };
}

function imageFileOf(mapsDir: string, mapId: string): string | null {
  try {
    const raw = readFileSync(path.join(mapsDir, `${mapId}.json`), 'utf-8');
    const { map } = parseBitkaMap(JSON.parse(raw), { id: mapId, allowEmpty: true });
    if (!map?.imageFile) return null;
    return path.join(mapsDir, mapId, map.imageFile);
  } catch {
    return null;
  }
}

/**
 * Učitava mapu za start partije (mali JSON, jedno čitanje). Vraća oblik spreman
 * za klijente: `imageFile` razrešen u URL, `label` popunjen na svakoj
 * teritoriji, susedstva već simetrizovana kroz validator.
 *
 * `null` znači „ne može u igru" — nema fajla, ne prolazi strogu proveru, ili
 * slika ne postoji.
 */
export function resolveBitkaMapSync(
  mapsDir: string,
  mapId: string
): BitkaMapView | null {
  if (!MAP_ID_RE.test(mapId)) return null;

  let raw: string;
  try {
    raw = readFileSync(path.join(mapsDir, `${mapId}.json`), 'utf-8');
  } catch {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }

  const { map } = parseBitkaMap(json, { id: mapId });
  if (!map) return null;
  if (!existsSync(path.join(mapsDir, mapId, map.imageFile))) return null;

  return {
    id: mapId,
    name: map.name,
    imageUrl: `${BITKA_FILES_ROUTE}/${mapId}/${map.imageFile}`,
    territories: map.territories.map((t) => ({ ...t, label: labelAnchor(t) })),
    castleSites: map.castleSites,
  };
}

/**
 * Prva mapa koja prolazi strogu proveru, abecedno. Rezerva za slučaj da start
 * payload ne nosi izbor mape — bolje nego da igra bude nepokretna zbog
 * propuštenog polja.
 */
export function firstValidBitkaMapIdSync(mapsDir: string): string | null {
  let names: string[];
  try {
    names = readdirSync(mapsDir);
  } catch {
    return null;
  }
  for (const name of names.sort()) {
    if (!name.toLowerCase().endsWith('.json')) continue;
    const id = name.replace(/\.json$/i, '');
    if (!MAP_ID_RE.test(id)) continue;
    if (resolveBitkaMapSync(mapsDir, id)) return id;
  }
  return null;
}
