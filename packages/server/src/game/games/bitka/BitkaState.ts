import type {
  BitkaDuelOutcome,
  BitkaMapView,
  BitkaPhase,
  BitkaTerritoryState,
  KvizBrojQuestionFull,
  KvizChoiceQuestionFull,
} from '@igra/shared';

// Faze čekanja (podesive kroz /admin → Timinzi).
export const UVOD_DURATION = 7;
export const PITANJE_NAJAVA_DURATION = 4;
export const REZULTAT_DURATION = 6;
export const DUEL_REZULTAT_DURATION = 6;
export const LEADERBOARD_DURATION = 14;

// Aktivan unos — balans igre, ostaje u kodu.
export const ODGOVOR_DURATION = 20;
/** Prvi krug biranja baze; ponovljeni krugovi su kraći. */
export const BAZA_IZBOR_DURATION = 18;
export const BAZA_PONOVO_DURATION = 9;
/** Koliko puta se sudar oko iste baze rešava ponovnim biranjem. */
export const BAZA_MAX_PONAVLJANJA = 2;
/** Vreme jednom igraču da izabere slobodnu teritoriju. */
export const IZBOR_DURATION = 12;
export const NAPAD_IZBOR_DURATION = 15;

/** Odgovor jednog igrača na tekuće pitanje. */
export interface BitkaAnswer {
  optionIndex?: number;
  value?: number;
  /** Koliko je sekundi ostalo kad je potvrdio — brzina rešava izjednačenja. */
  remaining: number;
  correct: boolean;
}

/** Skuplja se kroz partiju samo zbog diploma na kraju. */
export interface BitkaStats {
  osvojeno: number;
  odbrana: number;
  zidova: number;
  tacnih: number;
  netacnih: number;
}

export function emptyStats(): BitkaStats {
  return { osvojeno: 0, odbrana: 0, zidova: 0, tacnih: 0, netacnih: 0 };
}

export interface BitkaDuelState {
  attackerId: string;
  /** null kad je meta neutralna. */
  defenderId: string | null;
  territoryId: string;
  onCastle: boolean;
  outcome?: BitkaDuelOutcome;
}

export interface BitkaInternalState {
  phase: BitkaPhase;
  phaseTimeRemaining: number;

  map: BitkaMapView;
  /** Gde smeju zamkovi; null = bilo gde. */
  castleSites: string[] | null;
  board: Map<string, BitkaTerritoryState>;

  /** Pitanja se učitavaju asinhrono; uvod čeka dok ne stignu. */
  loading: boolean;
  choicePool: KvizChoiceQuestionFull[];
  brojPool: KvizBrojQuestionFull[];
  choiceCursor: number;
  brojCursor: number;

  /** Tekuće pitanje — puna verzija sa odgovorom, nikad ne izlazi iz modula. */
  choiceQuestion: KvizChoiceQuestionFull | null;
  brojQuestion: KvizBrojQuestionFull | null;
  answers: Map<string, BitkaAnswer>;
  expected: Set<string>;

  /** Redosled po rezultatu uvodnog broj-pitanja; rešava sudare oko baze. */
  priority: string[];
  baseChoice: Map<string, string>;
  basePasses: number;

  osvajanjeRound: number;
  /** Ko još bira slobodnu teritoriju, redom po brzini tačnog odgovora. */
  pickQueue: string[];

  round: number;
  totalRounds: number;
  turnOrder: string[];
  turnPointer: number;
  activePlayerId: string | null;
  /** Koliko je napada odigrano u tekućoj ratnoj rundi. */
  attacksThisRound: number;

  duel: BitkaDuelState | null;

  eliminated: Set<string>;
  /** Poeni koji ne dolaze od zemlje (odbrane, srušeni zidovi). */
  bonus: Map<string, number>;
  stats: Map<string, BitkaStats>;

  lastEvent: string;
  lastOutcome: Map<string, string>;
  winnerId: string | null;
}
