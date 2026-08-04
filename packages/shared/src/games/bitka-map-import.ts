// Validator za mape igre Osvajanje. Prati istu politiku kao ostali sadržajni
// validatori: **čitanje je popustljivo, igra je stroga**.
//
//   parseBitkaMap(raw, { id, allowEmpty: true })  → mapa se otvara u editoru
//   parseBitkaMap(raw, { id })                    → odlučuje `visibleInGame`
//
// Poruke su srpske i nose putanju do greške ("Teritorija 4 (porodin): ...")
// jer ih editor prikazuje uživo dok se crta.
//
// Provera da li slika zaista postoji na disku NIJE ovde — to zna samo server,
// pa je radi resolver.

import type { BitkaMap, BitkaMapSummary, BitkaPoint, BitkaTerritory } from '../types/bitka.js';
import {
  BITKA_MIN_IGRACA,
  BITKA_MIN_TERITORIJA,
  neighborsConnected,
  roundCoord,
  symmetrizeNeighbors,
} from './bitka-rules.js';

export interface ParseBitkaMapResult {
  map: BitkaMap | null;
  error: string | null;
}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const IMAGE_RE = /^[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp)$/;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parsePoint(raw: unknown, where: string): BitkaPoint | string {
  if (!raw || typeof raw !== 'object') return `${where}: tačka mora biti objekat`;
  const r = raw as Record<string, unknown>;
  const x = typeof r.x === 'number' ? r.x : NaN;
  const y = typeof r.y === 'number' ? r.y : NaN;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return `${where}: tačka mora imati brojeve "x" i "y"`;
  }
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return `${where}: koordinate moraju biti između 0 i 1 (dobijeno ${x}, ${y})`;
  }
  return { x: roundCoord(x), y: roundCoord(y) };
}

function parseTerritory(raw: unknown, where: string): BitkaTerritory | string {
  if (!raw || typeof raw !== 'object') return `${where}: teritorija mora biti objekat`;
  const r = raw as Record<string, unknown>;

  const id = str(r.id).toLowerCase();
  if (!id) return `${where}: nedostaje "id"`;
  if (!ID_RE.test(id)) {
    return `${where}: "id" sme da sadrži samo mala slova, cifre i crticu ("${id}")`;
  }

  const name = str(r.name);
  if (!name) return `${where}: nedostaje "name"`;

  if (!Array.isArray(r.polygon)) return `${where}: nedostaje niz "polygon"`;
  if (r.polygon.length < 3) {
    return `${where}: poligon mora imati bar 3 tačke (ima ${r.polygon.length})`;
  }
  const polygon: BitkaPoint[] = [];
  for (let i = 0; i < r.polygon.length; i++) {
    const p = parsePoint(r.polygon[i], `${where} · tačka ${i + 1}`);
    if (typeof p === 'string') return p;
    polygon.push(p);
  }

  const territory: BitkaTerritory = { id, name, polygon, neighbors: [] };

  if (r.label !== undefined) {
    const l = parsePoint(r.label, `${where} · sidro imena`);
    if (typeof l === 'string') return l;
    territory.label = l;
  }

  if (r.neighbors !== undefined) {
    if (!Array.isArray(r.neighbors)) return `${where}: "neighbors" mora biti niz`;
    territory.neighbors = r.neighbors
      .map((n) => str(n).toLowerCase())
      .filter(Boolean);
  }

  if (r.value !== undefined) {
    const value = typeof r.value === 'number' ? r.value : NaN;
    if (!Number.isFinite(value) || value <= 0) {
      return `${where}: "value" mora biti pozitivan broj`;
    }
    territory.value = Math.round(value);
  }

  return territory;
}

/**
 * Parsira sirov objekat mape. `allowEmpty` je prekidač za editor: propušta
 * mapu koja još nema dovoljno teritorija, sliku ili povezan graf, ali i dalje
 * odbija strukturno pokvarene podatke (da editor ne bi radio nad smećem).
 */
export function parseBitkaMap(
  input: unknown,
  opts: { id?: string; allowEmpty?: boolean } = {}
): ParseBitkaMapResult {
  let obj = input;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return { map: null, error: 'Neispravan JSON' };
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { map: null, error: 'Mapa mora biti objekat' };
  }

  const r = obj as Record<string, unknown>;
  const name = str(r.name);
  const description = str(r.description);
  const imageFile = str(r.imageFile);

  if (r.territories !== undefined && !Array.isArray(r.territories)) {
    return { map: null, error: 'Polje "territories" mora biti niz' };
  }
  const rawTerritories = Array.isArray(r.territories) ? r.territories : [];

  const territories: BitkaTerritory[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rawTerritories.length; i++) {
    const t = parseTerritory(rawTerritories[i], `Teritorija ${i + 1}`);
    if (typeof t === 'string') return { map: null, error: t };
    if (seen.has(t.id)) {
      return { map: null, error: `Teritorija ${i + 1}: id "${t.id}" se ponavlja` };
    }
    seen.add(t.id);
    territories.push(t);
  }

  // Veze ka nepostojećim teritorijama su greška u strogom režimu; u editoru se
  // tiho odbacuju, jer nastaju svaki put kad se teritorija obriše.
  if (!opts.allowEmpty) {
    for (const t of territories) {
      const dangling = t.neighbors.find((n) => n !== t.id && !seen.has(n));
      if (dangling) {
        return {
          map: null,
          error: `Teritorija "${t.name}": sused "${dangling}" ne postoji na mapi`,
        };
      }
    }
  }

  const linked = symmetrizeNeighbors(territories);

  let castleSites: string[] | undefined;
  if (r.castleSites !== undefined) {
    if (!Array.isArray(r.castleSites)) {
      return { map: null, error: 'Polje "castleSites" mora biti niz' };
    }
    const sites = r.castleSites.map((s) => str(s).toLowerCase()).filter(Boolean);
    const unknown = sites.find((s) => !seen.has(s));
    if (unknown && !opts.allowEmpty) {
      return { map: null, error: `Mesto za zamak "${unknown}" ne postoji na mapi` };
    }
    const clean = sites.filter((s) => seen.has(s));
    if (clean.length > 0) castleSites = [...new Set(clean)];
  }

  const map: BitkaMap = {
    id: opts.id ?? '',
    name: name || opts.id || 'Mapa',
    description: description || undefined,
    imageFile,
    territories: linked,
    castleSites,
  };

  if (opts.allowEmpty) return { map, error: null };

  // ---- Stroge provere: odavde nadalje odlučuje se `visibleInGame`. ----------

  if (!imageFile) {
    return { map: null, error: 'Mapa nema sliku — otpremi PNG pre nego što je pustiš u igru' };
  }
  if (!IMAGE_RE.test(imageFile)) {
    return { map: null, error: `Neispravno ime slike: "${imageFile}"` };
  }
  if (linked.length < BITKA_MIN_TERITORIJA) {
    return {
      map: null,
      error: `Mapa mora imati bar ${BITKA_MIN_TERITORIJA} teritorija (ima ${linked.length})`,
    };
  }
  const isolated = linked.find((t) => t.neighbors.length === 0);
  if (isolated) {
    return { map: null, error: `Teritorija "${isolated.name}" nema nijednog suseda` };
  }
  if (!neighborsConnected(linked)) {
    return {
      map: null,
      error: 'Mapa je razbijena na više odvojenih celina — poveži ih susedstvima',
    };
  }
  // Traži se samo minimum igrača: mapa sa tri mesta je i dalje sasvim dobra
  // mapa za dvoje ili troje. Da li ih ima dovoljno za konkretnu partiju
  // proverava modul na startu, kad se zna koliko ih je za stolom.
  if (castleSites && castleSites.length < BITKA_MIN_IGRACA) {
    return {
      map: null,
      error: `Ako zadaješ mesta za zamkove, mora ih biti bar ${BITKA_MIN_IGRACA} (ima ${castleSites.length})`,
    };
  }

  return { map, error: null };
}

/** Sažetak za `/api/bitka-maps` i za listu u adminu. */
export function summarizeBitkaMap(id: string, input: unknown): BitkaMapSummary {
  const lax = parseBitkaMap(input, { id, allowEmpty: true });
  const strict = parseBitkaMap(input, { id });
  return {
    id,
    name: lax.map?.name ?? id,
    description: lax.map?.description,
    territoryCount: lax.map?.territories.length ?? 0,
    hasImage: !!lax.map?.imageFile,
    visibleInGame: strict.map !== null,
    error: strict.map ? undefined : (strict.error ?? lax.error ?? 'Nevažeća mapa'),
  };
}
