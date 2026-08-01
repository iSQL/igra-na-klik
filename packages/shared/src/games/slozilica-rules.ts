// Složilica — pločice, bodovanje i normalizacija unosa.
//
// Provera da li reč postoji je serverska (traži rečnik od ~250k reči), ali
// sve ostalo je ovde jer i telefon i TV moraju da računaju isto: kontroler
// sivi slova koja su potrošena, TV prikazuje bodove uz reč.

/**
 * Koliko pločica domaćin deli po rundi.
 *
 * Merenjem (400 deljenja po varijanti kroz stvarni rečnik) prosečna najduža
 * moguća reč je: 7 pločica → 5,6 · 9 → 7,1 · 11 → 8,1. Sa samo 7 pločica se
 * sedmoslovna reč može složiti u ~10% rundi, pa najviši nivo bodova skoro i
 * ne opali — zato je podrazumevano 9, gde cela tabela oživi.
 */
export const SLOZILICA_LETTER_OPTIONS = [7, 9, 11] as const;
export const SLOZILICA_LETTER_DEFAULT = 9;
export const SLOZILICA_MAX_LETTERS = 11;
export const SLOZILICA_MIN_WORD = 3;

/** Samoglasnici — set se generiše tako da ih uvek ima dovoljno za igru. */
export const SLOZILICA_VOWELS = ['a', 'e', 'i', 'o', 'u'] as const;

/** Svodi izbor domaćina na dozvoljene vrednosti (ponovo se proverava i na serveru). */
export function clampLetterCount(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : NaN;
  return (SLOZILICA_LETTER_OPTIONS as readonly number[]).includes(n)
    ? n
    : SLOZILICA_LETTER_DEFAULT;
}

/**
 * Bodovi po dužini reči. Rastu brže nego linearno da bi jedna duga reč
 * vredela više od dve kratke — inače se isplati kucati „oko, ono, ova".
 * Ide do 11 jer je toliko i najviše pločica.
 */
export const SLOZILICA_WORD_POINTS: Record<number, number> = {
  3: 30,
  4: 60,
  5: 110,
  6: 180,
  7: 300,
  8: 450,
  9: 650,
  10: 900,
  11: 1200,
};

/**
 * Težine slova, grubo po učestalosti u srpskom. Digrafi (lj, nj, dž) se ne
 * tretiraju posebno — u latinici su to dva znaka, pa se „ljubav" prirodno
 * slaže od l + j + u + b + a + v.
 */
const LETTER_WEIGHTS: Record<string, number> = {
  a: 114, e: 94, i: 92, o: 91, n: 64, r: 54, s: 48, t: 47, j: 44, u: 37,
  k: 34, d: 33, m: 31, p: 30, v: 29, l: 28, g: 16, z: 16, b: 15, c: 13,
  č: 10, š: 10, h: 9, ž: 9, ć: 8, đ: 3, f: 2,
};

const WEIGHTED_POOL: string[] = Object.entries(LETTER_WEIGHTS).flatMap(
  ([letter, weight]) => Array<string>(weight).fill(letter)
);

export function isVowel(letter: string): boolean {
  return (SLOZILICA_VOWELS as readonly string[]).includes(letter);
}

/** Bodovi za validnu reč date dužine (0 ako je van opsega). */
export function scoreWord(word: string): number {
  return SLOZILICA_WORD_POINTS[[...word].length] ?? 0;
}

/** Mala slova, bez razmaka, NFC — i unos i rečnik prolaze kroz ovo. */
export function normalizeWord(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFC');
}

/** Samo srpska latinica; ništa sa razmakom, crticom ili ciframa. */
export function isPlausibleWord(word: string): boolean {
  return /^[a-zčćđšž]+$/.test(word);
}

/**
 * Nasumične pločice sa kontrolisanim brojem samoglasnika (skalira se sa
 * brojem pločica — oko 30–55% seta). Ne garantuje da se od njih može složiti
 * dobra reč; to server proverava kroz rečnik i po potrebi traži nov set
 * (vidi SlozilicaModule.dealLetters).
 */
export function generateLetters(
  count: number = SLOZILICA_LETTER_DEFAULT,
  rng: () => number = Math.random
): string[] {
  const minVowels = Math.max(2, Math.round(count * 0.28));
  const maxVowels = Math.round(count * 0.55);
  const letters: string[] = [];
  let vowels = 0;

  while (letters.length < count) {
    const remaining = count - letters.length;
    // Pred kraj forsiraj ono što nedostaje da bi set uvek bio igriv.
    const needVowel = vowels < minVowels && remaining <= minVowels - vowels;
    const vowelsFull = vowels >= maxVowels;

    let pick = WEIGHTED_POOL[Math.floor(rng() * WEIGHTED_POOL.length)];
    if (needVowel) {
      pick = SLOZILICA_VOWELS[Math.floor(rng() * SLOZILICA_VOWELS.length)];
    } else if (vowelsFull && isVowel(pick)) {
      continue;
    }

    if (isVowel(pick)) vowels += 1;
    letters.push(pick);
  }

  return letters;
}

/**
 * Koje su pločice još slobodne kad se ispiše `typed`. Vraća `null` ako se reč
 * uopšte ne može složiti od datih pločica. Kontroler ovim sivi iskorišćena
 * slova dok igrač kuca.
 */
export function remainingLetters(
  letters: readonly string[],
  typed: string
): string[] | null {
  const pool = [...letters];
  for (const ch of [...normalizeWord(typed)]) {
    const at = pool.indexOf(ch);
    if (at === -1) return null;
    pool.splice(at, 1);
  }
  return pool;
}
