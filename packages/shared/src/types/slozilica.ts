// Složilica — od 7 ponuđenih slova svako slaže najdužu reč koju može.
//
// Ime je namerno NIJE „Slagalica": to je naziv RTS-ovog kviza koji ide od
// 1993, a ovo je isti tip proizvoda (kviz/igra), pa bi kolizija bila
// najizraženija. „Složilica" opisuje mehaniku i ne postoji kao brend.

export type SlozilicaPhase = 'najava' | 'pisanje' | 'rezultati' | 'ended';

/** Zašto je predlog odbijen — prikazuje se igraču odmah, na njegovom telefonu. */
export type SlozilicaRejection =
  | 'prekratko'
  | 'nema-slova'
  | 'nije-rec'
  | 'vec-poslato';

export interface SlozilicaWord {
  word: string;
  points: number;
}

export interface SlozilicaPlayerResult {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  /** Najbolja reč igrača u rundi; prazno ako nije poslao nijednu validnu. */
  bestWord: string;
  points: number;
  /** Koliko je ukupno validnih reči našao (za „našao ih je 9" na TV-u). */
  wordCount: number;
}

export interface SlozilicaHostData {
  round: number;
  totalRounds: number;
  /** Pločice za ovu rundu — javne, svi igraju iste. */
  letters: string[];

  // pisanje — samo brojači i „gotov sam" zastavice, nikad same reči
  // (vidi anti-leak u modulu).
  foundCounts?: { playerId: string; count: number; done: boolean }[];

  // rezultati
  results?: SlozilicaPlayerResult[];
  /** Najduže što je uopšte bilo moguće — poenta „ma nema šanse" trenutka. */
  bestPossible?: string[];

  // rezultati / ended
  leaderboard?: {
    playerId: string;
    name: string;
    avatarColor: string;
    avatarEmoji: string;
    score: number;
    rank: number;
  }[];
}

export interface SlozilicaControllerData {
  /** Da li je ovaj igrač rekao „gotov sam" — runda čeka još samo ostale. */
  done?: boolean;
  /** Sve validne reči koje je OVAJ igrač poslao — nikad tuđe. */
  myWords?: SlozilicaWord[];
  myBest?: string;
  myPoints?: number;
  /** Poslednji odbijeni predlog, da telefon može da kaže zašto. */
  lastRejected?: { word: string; reason: SlozilicaRejection };
  score?: number;
}
