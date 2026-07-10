// "Bolji život!" — Omerta/Cabo varijanta sa likovima iz "Srećnih ljudi".
// Špil od 45 karata: bodovi su "orasi u džepu" (0 najbolje, 13 najgore).
// Puna pravila i balans odluke: docs/bolji-zivot-dizajn.md.

export type BoljiZivotPowerKind =
  | 'peek-own' // 5 Kustudić — pogledaj jednu svoju kartu
  | 'peek-other' // 6 Ilija Pandurović — pogledaj jednu tuđu kartu
  | 'blind-swap' // 7 Aranđel Golubović — slepa zamena svoje i tuđe
  | 'raid' // 8 Inspektor Naumović — svakome se otkriva nasumična karta
  | 'look-swap'; // 9 Direktor Kurčubić — pogledaj tuđu, po želji zameni

export interface BoljiZivotCardDef {
  v: number;
  name: string;
  count: number;
  emoji: string;
  power?: BoljiZivotPowerKind;
}

// "Pogledaj i zameni" je najjača ciljana moć pa namerno sedi na 9 (najskuplja
// obična karta), a racija na 8 — ne vraćati na "policija = 9" raspored.
export const BOLJI_ZIVOT_DECK_DEF: readonly BoljiZivotCardDef[] = [
  { v: 0, name: 'Beban', count: 1, emoji: '👶' },
  { v: 0, name: 'Neca i Žiki', count: 1, emoji: '👬' },
  { v: 1, name: 'Guza', count: 4, emoji: '🧢' },
  { v: 2, name: 'Vukašin', count: 4, emoji: '👨‍🌾' },
  { v: 3, name: 'Emilija', count: 4, emoji: '👩' },
  { v: 4, name: 'Lola', count: 4, emoji: '💃' },
  { v: 5, name: 'Kustudić', count: 4, emoji: '🚗', power: 'peek-own' },
  { v: 6, name: 'Ilija Pandurović', count: 4, emoji: '🔓', power: 'peek-other' },
  { v: 7, name: 'Aranđel Golubović', count: 4, emoji: '🌀', power: 'blind-swap' },
  { v: 8, name: 'Inspektor Naumović', count: 4, emoji: '🚨', power: 'raid' },
  { v: 9, name: 'Direktor Kurčubić', count: 4, emoji: '💼', power: 'look-swap' },
  { v: 10, name: 'Malina Vojvodić', count: 2, emoji: '💋' },
  { v: 11, name: 'Ozren Soldatović', count: 2, emoji: '🕴️' },
  { v: 12, name: 'Radomir Popara', count: 2, emoji: '📋' },
  { v: 13, name: 'Riska Golubović', count: 1, emoji: '👵' },
];

export const BZ_MALINA_V = 10;
export const BZ_OZREN_V = 11;
export const BZ_POPARA_V = 12;
export const BZ_RISKA_V = 13;

/** Kazna kad pozivač "Bolji život!" ne bude strogo najniži. */
export const BZ_CALL_PENALTY = 20;

/** Dužina paralelnog SLAP prozora — server rok + klijentski progress bar. */
export const BZ_SLAP_WINDOW_SECONDS = 4;

export const BZ_POWER_BY_VALUE: Readonly<
  Record<number, BoljiZivotPowerKind | undefined>
> = {
  5: 'peek-own',
  6: 'peek-other',
  7: 'blind-swap',
  8: 'raid',
  9: 'look-swap',
};

/** Kratak srpski opis moći — koristi se na kartama i u uputstvima na ekranu. */
export const BZ_POWER_TEXT: Readonly<Record<BoljiZivotPowerKind, string>> = {
  'peek-own': 'Pogledaj jednu svoju kartu',
  'peek-other': 'Pogledaj jednu tuđu kartu',
  'blind-swap': 'Zameni svoju kartu sa tuđom — bez gledanja',
  raid: 'Racija! Svakome se otkriva jedna nasumična karta',
  'look-swap': 'Pogledaj tuđu kartu i po želji je zameni sa svojom',
};

export interface BZCardInfo {
  v: number;
  name: string;
}

export function bzDeckDefFor(v: number, name: string): BoljiZivotCardDef | undefined {
  return BOLJI_ZIVOT_DECK_DEF.find((d) => d.v === v && d.name === name);
}

export function bzEmojiFor(v: number, name: string): string {
  return bzDeckDefFor(v, name)?.emoji ?? '🃏';
}

/** Ceo špil (45 karata) raširen iz definicije, nepromešan redosled. */
export function buildBoljiZivotDeck(): BZCardInfo[] {
  const deck: BZCardInfo[] = [];
  for (const def of BOLJI_ZIVOT_DECK_DEF) {
    for (let i = 0; i < def.count; i++) {
      deck.push({ v: def.v, name: def.name });
    }
  }
  return deck;
}

/**
 * Zbir oraha jedne porodice uz Malina+Ozren pravilo: svaki Ozren (11)
 * "pokriva" tačno jednu Malinu (10) — upareni vrede 0. Vraća zbir i indekse
 * uparenih karata (za prikaz pri otkrivanju).
 */
export function bzRoundSum(cards: readonly BZCardInfo[]): {
  sum: number;
  pairedIndices: number[];
} {
  const malinaIdx = cards
    .map((c, i) => (c.v === BZ_MALINA_V ? i : -1))
    .filter((i) => i >= 0);
  const ozrenIdx = cards
    .map((c, i) => (c.v === BZ_OZREN_V ? i : -1))
    .filter((i) => i >= 0);
  const pairs = Math.min(malinaIdx.length, ozrenIdx.length);
  const paired = [...malinaIdx.slice(0, pairs), ...ozrenIdx.slice(0, pairs)];
  const pairedSet = new Set(paired);
  let sum = 0;
  cards.forEach((c, i) => {
    if (!pairedSet.has(i)) sum += c.v;
  });
  return { sum, pairedIndices: paired };
}
