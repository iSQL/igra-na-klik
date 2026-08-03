import type {
  BitkaAnswerResult,
  BitkaDuelOutcome,
  BitkaMode,
  BitkaMapView,
  BitkaPhase,
  BitkaTerritoryState,
  KvizBrojQuestionFull,
  KvizChoiceQuestionFull,
} from '@igra/shared';

// Faze čekanja (podesive kroz /admin → Timinzi).
export const UVOD_DURATION = 7;
export const PITANJE_NAJAVA_DURATION = 4;
// Otkrivanje se gleda na ekranu pitanja — vidi se ko je šta odabrao i šta je
// tačno — pa mora da traje bar koliko treba da se to pročita.
export const REZULTAT_DURATION = 4;
export const DUEL_REZULTAT_DURATION = 6;
/**
 * Dodatak na ishod duela koji je rešen brojem. Tada se na jednom ekranu
 * otkrivaju dva pitanja — izborno sa avatarima i broj sa procenama — pa isto
 * vreme ne stigne da se pročita. Ide **povrh** podesivog `DUEL_REZULTAT_DURATION`,
 * pa se i dalje sve pomera kad se u /admin → Timinzi promeni osnova.
 */
export const DUEL_TIEBREAK_EXTRA = 3;
export const LEADERBOARD_DURATION = 14;

// Aktivan unos — balans igre, ostaje u kodu.
export const ODGOVOR_DURATION = 20;
/**
 * Vreme JEDNOM igraču da postavi zamak. Zamkovi se biraju naizmenično, po
 * redosledu iz uvodnog pitanja, i svaki se odmah vidi na mapi — ko bira
 * kasnije zna gde su prethodni, pa je pozni izbor taktički, a ne kockanje.
 */
export const BAZA_IZBOR_DURATION = 14;
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
  /** Rotacija ili niz — bira se pri pokretanju igre. */
  mode: BitkaMode;

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
  /**
   * Odgovori na izborno pitanje duela, snimljeni pre nego što tiebreak
   * prepiše `answers` procenama. Bez ovoga otkrivanje posle nerešenog duela
   * ostane bez podatka ko je šta izabrao.
   */
  choiceResults: BitkaAnswerResult[] | null;

  /** Redosled po rezultatu uvodnog broj-pitanja; određuje ko prvi bira zamak. */
  priority: string[];
  /** Gde je ko podigao zamak — popunjava se kako igrači redom biraju. */
  baseChoice: Map<string, string>;
  /** Ko još čeka na red za zamak, prvi u nizu je na potezu. */
  baseQueue: string[];

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
