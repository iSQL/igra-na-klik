// Osvajanje — bodovanje, zidovi i geometrija teritorija.
//
// Sve je ovde a ne u serverskom modulu jer i telefon i TV moraju da računaju
// isto: kontroler radi pogodak-u-poligon da bi znao šta si tapnuo, TV crta
// ime na istom sidru, a oba prikazuju iste bodove.
//
// Geometrija je normalizovana [0, 1] preko slike mape — bez lat/lng, jer su
// mape crteži a ne projekcije.

import type { BitkaPoint, BitkaTerritory } from '../types/bitka.js';
import type { KvizQuestionType } from '../types/quiz.js';

/**
 * Tipovi kviz-pitanja koje KvizAtar ume da postavi — jedini izvor istine za
 * server (filtriranje pakova) i za selektor pitanja na TV-u i telefonu.
 *
 * Svi idu i u trku za slobodnu zemlju i u duel: pak je jedan, a duel je isto
 * pitanje sa dva odgovarača. Ostaju napolju samo tri stvari koje se ne mogu
 * odigrati na ovoj tabli: medij (TV već nosi mapu, a hostless soba nema gde da
 * ga pusti), druga mapa (`geo` — mapa JESTE bojno polje) i `piksel`, kome
 * treba postepeno izoštravanje slike.
 *
 * Cena tekstualnih tipova je poznata i prihvaćena: kucanje znači da brzina
 * palca učestvuje u ishodu, a promašaj se sme ponavljati do isteka vremena, pa
 * duel na njima češće ide do kraja od 20 s umesto da se prekine čim oba
 * odgovore. Zato ih ima smisla čekirati svesno, a ne držati sve upaljeno.
 *
 * `broj` je ovde jer nosi razrešenje nerešenog duela i uvodno merenje; ostali
 * se postavljaju kao pitanje (`BITKA_PITANJE_TYPES`).
 */
export const BITKA_QUIZ_TYPES: KvizQuestionType[] = [
  'obicno',
  'uljez',
  'matrica',
  'redosled',
  'domino',
  'emoji',
  'dopuna',
  'anagram',
  'broj',
];

/** Tipovi koji smeju da budu POSTAVLJENI kao pitanje (bez razrešenja). */
export const BITKA_PITANJE_TYPES: KvizQuestionType[] = [
  'obicno',
  'uljez',
  'matrica',
  'redosled',
  'domino',
  'emoji',
  'dopuna',
  'anagram',
];

/**
 * Svaki igrač drži tačno jedan zamak, pa je broj igrača i broj zamkova.
 * Dvoje je čist duel, troje je Triviador-verno, četvoro traži veću mapu —
 * odatle `bitkaMinTeritorija`, koji se proverava na startu partije, a ne pri
 * uvozu mape (ista mapa sme da bude tesna za četvoro i taman za dvoje).
 */
export const BITKA_MIN_IGRACA = 2;
export const BITKA_MAX_IGRACA = 4;

/** Zamak nosi najviše poena — zato se i napada. */
export const BITKA_ZAMAK_BODOVI = 1000;
/** Podrazumevana vrednost obične teritorije (mapa je sme nadjačati). */
export const BITKA_TERITORIJA_BODOVI = 200;
/** Branilac ne dobija zemlju, pa uspešnu odbranu plaćamo poenima. */
export const BITKA_ODBRANA_BONUS = 100;
/** Srušen zid tuđeg zamka — napredak se vidi i kad zamak ne padne. */
export const BITKA_ZID_BONUS = 200;

/** Koliko duela treba dobiti da bi zamak pao. */
export const BITKA_ZIDOVI = 3;

/**
 * Ispod ovoga mapa nema smisla ni u najmanjoj postavi: po tri teritorije na
 * igrača u punoj Triviador postavi (3 zamka + po dve za osvajanje). Strogi
 * validator odbija manje — ali maks. broj igrača na koji mapa staje zavisi od
 * njene veličine, pa se to proverava na startu (`bitkaMinTeritorija`).
 */
export const BITKA_MIN_TERITORIJA = 9;

/**
 * Koliko teritorija traži partija sa `players` igrača: po jedna za zamak i bar
 * dve za osvajanje. Bez ovoga bi četvoro na maloj mapi ostalo bez slobodne
 * zemlje već u prvoj rundi, a poslednji na redu i bez mesta za zamak.
 */
export function bitkaMinTeritorija(players: number): number {
  return players * 3;
}

/** Koliko rundi osvajanja najviše, ako se mapa ne popuni ranije. */
export const BITKA_MAX_OSVAJANJE_RUNDI = 6;

/**
 * Rat traje dok ne ostane samo jedan zamak — to je ceo smisao igre. Ovo je
 * samo zaštita od zaglavljene partije (npr. svi promašuju iz runde u rundu):
 * kad se dostigne, pobeđuje najveći zbir poena. Nije podesivo, jer nije
 * balans nego osigurač.
 */
export const BITKA_MAX_RATNIH_RUNDI = 25;

/** Vrednost teritorije u poenima. */
export function territoryValue(t: Pick<BitkaTerritory, 'value'>): number {
  return typeof t.value === 'number' && Number.isFinite(t.value) && t.value > 0
    ? Math.round(t.value)
    : BITKA_TERITORIJA_BODOVI;
}

/**
 * Da li tačka pada u poligon — ray casting. Koristi ga kontroler da od tapa
 * na mapi dobije teritoriju, i validator da proveri da sidro imena nije
 * odlutalo van oblika.
 */
export function pointInPolygon(point: BitkaPoint, polygon: BitkaPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.y > point.y !== b.y > point.y;
    if (!straddles) continue;
    const xAt = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < xAt) inside = !inside;
  }
  return inside;
}

/**
 * Površinski centroid poligona. Za degenerisan oblik (nulta površina) pada na
 * prosek tačaka, da nikad ne vrati NaN.
 */
export function polygonCentroid(polygon: BitkaPoint[]): BitkaPoint {
  if (polygon.length === 0) return { x: 0.5, y: 0.5 };

  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j];
    const b = polygon[i];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    const sum = polygon.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 }
    );
    return { x: sum.x / polygon.length, y: sum.y / polygon.length };
  }

  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
}

/**
 * Sidro imena/zamka: eksplicitno zadato ako postoji, inače centroid, a ako
 * centroid ispadne van konkavnog oblika — prva tačka poligona pomerena ka
 * centroidu, samo da natpis ne visi u praznom.
 */
export function labelAnchor(t: BitkaTerritory): BitkaPoint {
  if (t.label && Number.isFinite(t.label.x) && Number.isFinite(t.label.y)) {
    return t.label;
  }
  const c = polygonCentroid(t.polygon);
  if (t.polygon.length < 3 || pointInPolygon(c, t.polygon)) return c;
  const first = t.polygon[0];
  return { x: (first.x + c.x) / 2, y: (first.y + c.y) / 2 };
}

/**
 * Susedstva su neusmerena, ali se u editoru upisuju s jedne strane. Vraća nove
 * teritorije sa unijom oba smera, bez samopetlji i bez veza ka nepostojećim
 * id-jevima.
 */
export function symmetrizeNeighbors(
  territories: BitkaTerritory[]
): BitkaTerritory[] {
  const known = new Set(territories.map((t) => t.id));
  const links = new Map<string, Set<string>>();
  for (const t of territories) links.set(t.id, new Set());

  for (const t of territories) {
    for (const n of t.neighbors) {
      if (n === t.id || !known.has(n)) continue;
      links.get(t.id)!.add(n);
      links.get(n)!.add(t.id);
    }
  }

  return territories.map((t) => ({
    ...t,
    neighbors: [...links.get(t.id)!].sort(),
  }));
}

/**
 * Da li je graf susedstava povezan. Nepovezana mapa znači teritoriju do koje
 * se ne može doći napadom, pa strogi validator to odbija.
 */
export function neighborsConnected(territories: BitkaTerritory[]): boolean {
  if (territories.length <= 1) return true;
  const byId = new Map(territories.map((t) => [t.id, t]));
  const seen = new Set<string>([territories[0].id]);
  const queue = [territories[0].id];

  while (queue.length > 0) {
    const current = byId.get(queue.shift()!);
    if (!current) continue;
    for (const n of current.neighbors) {
      if (seen.has(n) || !byId.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }

  return seen.size === territories.length;
}

/** Zaokruživanje koordinate na 4 decimale — geometrija putuje kroz socket. */
export function roundCoord(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** Ponuđeni brojevi ratnih rundi kad se igra na runde. */
export const BITKA_RUNDE_IZBOR = [6, 9, 12] as const;
export const BITKA_RUNDE_DEF = 9;
