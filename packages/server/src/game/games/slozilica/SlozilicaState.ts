import type { SlozilicaPhase, SlozilicaRejection, SlozilicaWord } from '@igra/shared';

// Faze čekanja (podesive kroz /admin → Timinzi).
export const NAJAVA_DURATION = 4;
export const REZULTATI_DURATION = 12;
// Aktivan unos — balans igre, ostaje u kodu. Runda se ionako završava ranije
// čim svi kažu „gotov sam", pa tajmer služi samo kao gornja granica.
export const PISANJE_DURATION = 120;

/** Koliko puta pokušavamo da izvučemo set slova sa pristojnom najdužom reči. */
export const DEAL_ATTEMPTS = 60;
/** Set se prihvata tek ako se od njega može složiti bar ovoliko duga reč. */
export const MIN_BEST_WORD_LENGTH = 5;

export interface SlozilicaPlayerRound {
  /** Prihvaćene reči, redom kojim su poslate. */
  words: SlozilicaWord[];
  /** Sve što je igrač poslao (i odbijeno) — sprečava ponavljanje istog. */
  tried: Set<string>;
  best: string;
  /** Bodovi najbolje reči — to je ono što se sabira u ukupan skor. */
  points: number;
}

export function emptyRound(): SlozilicaPlayerRound {
  return { words: [], tried: new Set(), best: '', points: 0 };
}

export interface SlozilicaInternalState {
  phase: SlozilicaPhase;
  phaseTimeRemaining: number;
  currentRound: number;
  totalRounds: number;
  /** Koliko pločica se deli (izbor domaćina: 7/9/11). */
  letterCount: number;
  /**
   * Ko se očekuje u ovoj rundi — snimljeno na ulasku u `pisanje`. Igrač koji
   * je otpao unutar grejs perioda ostaje u snimku da mu se mesto ne ukrade;
   * `onPlayerDisconnect` ga skida tek kad grejs istekne.
   */
  expected: Set<string>;
  /** Ko je rekao „gotov sam". */
  done: Set<string>;
  /** Pločice ove runde — javne. */
  letters: string[];
  /** Najduže moguće reči, izračunate pri deljenju; otkrivaju se u rezultatima. */
  bestPossible: string[];
  rounds: Map<string, SlozilicaPlayerRound>;
  /** Poslednje odbijanje po igraču — samo za njegov telefon. */
  rejected: Map<string, { word: string; reason: SlozilicaRejection }>;
  /** Statistika za diplome. */
  stats: Map<string, { totalWords: number; longest: string; blankRounds: number }>;
}
