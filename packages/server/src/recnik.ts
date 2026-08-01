/**
 * Srpski rečnik za igre sa rečima (Složilica i eventualne buduće).
 *
 * Fajl je statički asset (`packages/server/assets/recnik/sr-recnik.txt`), ne
 * sadržaj koji se menja kroz admin — zato ne ide kroz `data-paths.ts` /
 * `DATA_DIR`, nego se razrešava kao `serbia-map.png` i brend ikonice. Docker
 * slika ga već nosi jer Dockerfile kopira ceo `assets/` folder.
 *
 * **Učitava se lenjo** — tek kad prva igra sa rečima krene. Sobe koje igraju
 * Kviz ili Penale ne plaćaju ~16 MB heapa bez potrebe.
 *
 * Poreklo liste i licence izvora: LICENSE.md (NOTICE).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SLOZILICA_MAX_LETTERS } from '@igra/shared';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** `src/` i `dist/` oba sede u packages/server/, pa je asset jedan nivo gore. */
const DEFAULT_RECNIK_FILE = path.resolve(
  __dirname,
  '..',
  'assets',
  'recnik',
  'sr-recnik.txt'
);

export const RECNIK_FILE = process.env.RECNIK_FILE
  ? path.resolve(process.env.RECNIK_FILE)
  : DEFAULT_RECNIK_FILE;

/**
 * Opseg dužina koje se uopšte mogu složiti. Gornja granica prati najveći
 * izbor pločica (11) — igriva podlista time raste sa ~87k na ~250k reči, a
 * pretraga najduljih ostaje ispod 20 ms po rundi.
 */
export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = SLOZILICA_MAX_LETTERS;

interface Recnik {
  /** Sve reči — za proveru da li uneta reč postoji. */
  all: Set<string>;
  /** Samo dužine koje se uopšte mogu složiti od pločica (3–11). */
  playable: string[];
}

let cache: Recnik | null = null;
let loadFailed = false;

/**
 * Učitava rečnik (jednom, pa keširano). Vraća `null` ako fajl nedostaje —
 * pozivalac tada treba da odbije start igre umesto da sruši sobu.
 */
export function loadRecnik(): Recnik | null {
  if (cache) return cache;
  if (loadFailed) return null;

  try {
    const started = Date.now();
    const raw = readFileSync(RECNIK_FILE, 'utf8');
    const all = new Set<string>();
    const playable: string[] = [];

    for (const line of raw.split('\n')) {
      // trim hvata i eventualni '\r' ako je fajl ipak prošao CRLF konverziju.
      const word = line.trim().normalize('NFC');
      if (!word) continue;
      all.add(word);
      const len = [...word].length;
      if (len >= MIN_WORD_LENGTH && len <= MAX_WORD_LENGTH) playable.push(word);
    }

    cache = { all, playable };
    logger.info('recnik.loaded', {
      words: all.size,
      playable: playable.length,
      ms: Date.now() - started,
      file: RECNIK_FILE,
    });
    return cache;
  } catch (err) {
    loadFailed = true;
    logger.error('recnik.load-failed', {
      file: RECNIK_FILE,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Da li rečnik uopšte postoji (za `validateStart` poruku domaćinu). */
export function recnikAvailable(): boolean {
  return loadRecnik() !== null;
}

export function isWord(word: string): boolean {
  const recnik = loadRecnik();
  if (!recnik) return false;
  return recnik.all.has(word.trim().toLowerCase().normalize('NFC'));
}

/** Broj pojavljivanja svakog slova — osnova za proveru „može li od pločica". */
export function letterCounts(letters: readonly string[] | string): Map<string, number> {
  const counts = new Map<string, number>();
  const source = typeof letters === 'string' ? [...letters] : letters;
  for (const ch of source) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return counts;
}

/**
 * Može li se `word` složiti od datih pločica — svako slovo najviše onoliko
 * puta koliko se pojavljuje među pločicama.
 */
export function canBuildFrom(word: string, letters: readonly string[]): boolean {
  const available = letterCounts(letters);
  for (const ch of [...word]) {
    const left = available.get(ch);
    if (!left) return false;
    available.set(ch, left - 1);
  }
  return true;
}

/**
 * Najduže reči koje se mogu složiti od datih pločica, opadajuće po dužini.
 * Skenira igrivu podlistu (~250k reči) — ispod 20 ms, jednom po rundi.
 */
export function findBestWords(letters: readonly string[], limit = 5): string[] {
  const recnik = loadRecnik();
  if (!recnik) return [];
  const found: string[] = [];
  for (const word of recnik.playable) {
    if (canBuildFrom(word, letters)) found.push(word);
  }
  found.sort((a, b) => [...b].length - [...a].length || a.localeCompare(b, 'sr'));
  return found.slice(0, limit);
}
