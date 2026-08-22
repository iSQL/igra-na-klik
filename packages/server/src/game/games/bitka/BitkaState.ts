import type {
  BitkaDuelOutcome,
  BitkaMode,
  BitkaMapView,
  BitkaPhase,
  BitkaTerritoryState,
  KvizAnagramQuestionFull,
  KvizBrojQuestionFull,
  KvizChoiceQuestionFull,
  KvizDominoQuestionFull,
  KvizDopunaQuestionFull,
  KvizEmojiQuestionFull,
  KvizMatricaQuestionFull,
  KvizRedosledQuestionFull,
} from '@igra/shared';

/**
 * Tipovi pitanja koji smeju u trku za zemlju i u duel.
 *
 * Zajedničko im je troje: svi vide istu stvar na ekranu (pa posmatrač duela
 * ima šta da gleda), unos je tap (ne kucanje, jer bi u duelu odlučivala brzina
 * palca), i rezultat je broj — što je ono što razrešava duel bez klizača.
 * Broj-pitanje NIJE ovde: ono ostaje razrešenje nerešenog duela i uvodno
 * merenje, gde je njegova neprekidna skala jedina koja razdvaja iz prvog puta.
 */
export type BitkaQuestionFull =
  | KvizChoiceQuestionFull
  | KvizMatricaQuestionFull
  | KvizRedosledQuestionFull
  | KvizDominoQuestionFull
  | KvizEmojiQuestionFull
  | KvizDopunaQuestionFull
  | KvizAnagramQuestionFull;

/** Slobodan tekst — tri tipa sa istim unosom i istim proveravanjem. */
export type BitkaTextQuestionFull =
  | KvizEmojiQuestionFull
  | KvizDopunaQuestionFull
  | KvizAnagramQuestionFull;

/** Dokle je igrač stigao kroz domino niz. */
export interface BitkaDominoProgress {
  /** Indeks pojma koji trenutno poredi sa prethodnim. */
  pos: number;
  streak: number;
  done: boolean;
}

// Faze čekanja (podesive kroz /admin → Timinzi).
export const UVOD_DURATION = 7;
/**
 * Odbrojavanje do pitanja. Pitanje se u ovoj fazi NE šalje — na ekranu stoji
 * samo brojač, pa svi krenu da čitaju u istom trenutku, kad se pitanje otvori
 * preko celog ekrana. Ranije je tekst stajao iznad mape pa se isto pitanje
 * čitalo dvaput, na dva različita mesta.
 */
export const PITANJE_NAJAVA_DURATION = 4;
// Otkrivanje se gleda na ekranu pitanja — vidi se ko je šta odabrao i šta je
// tačno — pa mora da traje bar koliko treba da se to pročita.
export const REZULTAT_DURATION = 4;
/**
 * Otkrivanje odgovora u duelu — koristi se za oba međukoraka: izborno pitanje
 * (`duel-odgovor-rezultat`) i broj koji razrešava nerešeno
 * (`duel-broj-rezultat`). Duel se dotad rešavao u tišini: ekran sa pitanjem bi
 * nestao čim oba igrača zaključaju, pa se tačan odgovor video tek uz ishod na
 * mapi — ili, kod nerešenog, nikad, jer bi odmah stigao klizač.
 */
export const DUEL_OTKRIVANJE_DURATION = 3;
/**
 * Prozor sa ishodom napada — „Porodin menja gospodara", „jedan zid manje".
 *
 * Ide PRE nego što se posledica upiše na tablu, pa mapa ostaje netaknuta dok
 * poruka stoji; animacije kreću tek posle njega. Ranije je ta rečenica bila
 * samo red teksta pored mape na kojoj je već sve bilo odigrano, pa se propušta
 * i šta se desilo i zašto.
 */
export const DUEL_ISHOD_DURATION = 4;
export const DUEL_REZULTAT_DURATION = 6;
/**
 * Završni kadar — konačna mapa, pobednik i rečenica kako se rat završio.
 *
 * Ranije je `finishGame` išao pravo u `ended`, pa je efekat pobede padao u
 * scenu koja odmah nestaje i niko nije stigao da pročita „pao je poslednji
 * zamak". Platformski ekran sa poenima i diplomama stiže tek posle ovoga.
 */
export const KRAJ_DURATION = 6;

// Aktivan unos — balans igre, ostaje u kodu.
export const ODGOVOR_DURATION = 20;
/**
 * Vreme JEDNOM igraču da postavi zamak. Zamkovi se biraju naizmenično, po
 * redosledu iz uvodnog pitanja, i svaki se odmah vidi na mapi — ko bira
 * kasnije zna gde su prethodni, pa je pozni izbor taktički, a ne kockanje.
 */
export const BAZA_IZBOR_DURATION = 14;
/**
 * Vreme jednom igraču da izabere slobodnu teritoriju. Kratko namerno: izbor
 * je jedan tap po mapi, a čeka ga celo društvo.
 */
export const IZBOR_DURATION = 8;
export const NAPAD_IZBOR_DURATION = 15;

/** Odgovor jednog igrača na tekuće pitanje. */
export interface BitkaAnswer {
  optionIndex?: number;
  value?: number;
  /** Matrica — indeksi izabranih ćelija, redom kojim su tapnute. */
  cells?: number[];
  /** Redosled — njegov poredak kao indeksi u prikazanoj listi. */
  order?: number[];
  /** Domino — dokle je stigao niz. */
  streak?: number;
  /** Tekstualna pitanja — pogođen odgovor onako kako ga je otkucao. */
  text?: string;
  /** Koliko je sekundi ostalo kad je potvrdio — brzina rešava izjednačenja. */
  remaining: number;
  /**
   * Rezultat na pitanju; veće je bolje. Izborno pitanje daje 0 ili 1, matrica
   * broj pogođenih pojmova. Duel i red biranja porede OVO.
   */
  score: number;
  /**
   * Prag „dovoljno dobar": tačan izborni odgovor, odnosno bar dva od tri pojma
   * u matrici. Nosi zemlju u trci i broji se u statistiku tačnih.
   */
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
  /** Nastavak opsade istog zamka — bez ponovljene kartice sa najavom. */
  continuation: boolean;
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
  questionPool: BitkaQuestionFull[];
  brojPool: KvizBrojQuestionFull[];
  questionCursor: number;
  brojCursor: number;

  /** Tekuće pitanje — puna verzija sa odgovorom, nikad ne izlazi iz modula. */
  question: BitkaQuestionFull | null;
  brojQuestion: KvizBrojQuestionFull | null;
  /**
   * Izmešani pojmovi redosled-pitanja i izmešana slova anagrama — računaju se
   * jednom, kad se pitanje postavi, jer moraju da budu isti za svakog igrača i
   * kroz svaki ponovni `buildGameState`.
   */
  shuffledItems: number[];
  scramble: string;
  /** Domino: dokle je ko stigao. Ceo niz ostaje ovde, nikad u broadcastu. */
  dominoProgress: Map<string, BitkaDominoProgress>;
  /** Poslednji promašen tekstualni pokušaj, po igraču — samo njemu se vraća. */
  wrongText: Map<string, string>;
  answers: Map<string, BitkaAnswer>;
  expected: Set<string>;
  /**
   * Ishod duela izračunat, ali još neprimenjen: između odgovora i posledice
   * stoji faza otkrivanja, a tabla sme da se promeni tek posle nje — inače bi
   * se zemlja obojila dok se još gleda tačan odgovor.
   */
  pendingAttackerWin: boolean | null;
  /** Broj-pitanje pripremljeno za nerešen duel, dok traje otkrivanje izbornog. */
  pendingBroj: KvizBrojQuestionFull | null;
  /** Ishod koji se čita u `duel-ishod`, dok tabla još stoji nepromenjena. */
  pendingOutcome: BitkaDuelOutcome | null;
  /** Zidovi posle udarca — poruka mora da važi pre nego što se tabla upiše. */
  pendingWalls: number;
  /**
   * Koliko će ko dobiti/izgubiti kad se ishod upiše — računa se u prvom
   * prolazu `applyDuel` i objavljuje u `duel-ishod`, a drugi prolaz proverava
   * da se stvarna promena poena s tim slaže.
   */
  pendingDeltas: { attacker: number; defender: number } | null;

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
  /**
   * Indeks u `turnOrder` na kome je tekuća runda počela. Runda je gotova kad
   * pokazivač ponovo stigne do njega — a ne kad se izbroje napadi, jer bi
   * ispadanje usred runde smanjilo imenilac i poslednjem u nizu uzelo potez.
   * Svaka runda počinje na sledećem živom igraču, da isti ne napada prvi
   * celu partiju.
   */
  roundStartPointer: number;
  activePlayerId: string | null;

  duel: BitkaDuelState | null;

  eliminated: Set<string>;
  /** Poeni koji ne dolaze od zemlje (odbrane, srušeni zidovi). */
  bonus: Map<string, number>;
  stats: Map<string, BitkaStats>;

  lastEvent: string;
  lastOutcome: Map<string, string>;
  winnerId: string | null;
  /** Izabrani pakovi su manji nego što će partija potrošiti — pokazuje se u uvodu. */
  poolWarning: string | null;
}
