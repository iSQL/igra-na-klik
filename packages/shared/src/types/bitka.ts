// Osvajanje — Triviador/Konquiztador na mapi koja se crta u adminu.
//
// Mape su ilustracije („epske rekreacije"), ne satelitski ni OSM izvodi, pa
// ovde NEMA geografije: nema lat/lng, nema bbox-a, nema projekcije. Sve su
// normalizovane {x, y} ∈ [0, 1] koordinate preko slike mape — isti prostor u
// kome već žive kviz geo pinovi, pa host i kontroler mogu da koriste isti
// wrapper sa zaključanim odnosom stranica.
//
// Interfejsi su podeljeni po dva kanala koja GameManager emituje:
// `BitkaHostData` ide u broadcast (vidi ga i TV i svaki telefon), a
// `BitkaControllerData` samo vlasniku. Šta sme u koji — vidi anti-leak
// komentar u BitkaModule.

export interface BitkaPoint {
  x: number;
  y: number;
}

/** Jedna teritorija na mapi — statički podatak, ne menja se tokom partije. */
export interface BitkaTerritory {
  /** Slug, stabilan kroz izmene mape (preimenovanje ne sme da ga promeni). */
  id: string;
  name: string;
  /** Granica, normalizovano [0, 1]; najmanje 3 tačke. */
  polygon: BitkaPoint[];
  /**
   * Sidro za ime i ikonu zamka. Centroid konkavnog oblika zna da ispadne van
   * poligona, pa se u editoru pomera ručno; resolver ga uvek popuni.
   */
  label?: BitkaPoint;
  /** Susedstva; učitavanje ih simetrizuje, pa je dovoljan jednosmeran unos. */
  neighbors: string[];
  /** Vrednost u poenima; podrazumevano BITKA_TERITORIJA_BODOVI. */
  value?: number;
}

/** Mapa kakva stoji u `bitka-maps/<id>.json`. */
export interface BitkaMap {
  id: string;
  name: string;
  description?: string;
  /** Ime fajla unutar `bitka-maps/<id>/`. */
  imageFile: string;
  territories: BitkaTerritory[];
  /** Ako je zadato, baze smeju samo na ove teritorije. Prazno = bilo gde. */
  castleSites?: string[];
}

/** Ono što vraća `/api/bitka-maps` — bez geometrije, za selektor mape. */
export interface BitkaMapSummary {
  id: string;
  name: string;
  description?: string;
  territoryCount: number;
  hasImage: boolean;
  /** Prolazi strogu proveru → sme u igru. */
  visibleInGame: boolean;
  /** Zašto ne sme, kad ne sme. */
  error?: string;
}

/** Mapa kakvu vide klijenti: `imageFile` razrešen u URL, `label` popunjen. */
export interface BitkaMapView {
  id: string;
  name: string;
  imageUrl: string;
  territories: (BitkaTerritory & { label: BitkaPoint })[];
  castleSites?: string[];
}

// ---------------------------------------------------------------------------
// Tok partije
// ---------------------------------------------------------------------------

export type BitkaPhase =
  | 'uvod'
  // Broj-pitanje koje određuje redosled postavljanja zamkova.
  | 'redosled-pitanje'
  | 'redosled-odgovor'
  | 'redosled-rezultat'
  // Svi istovremeno biraju svoj zamak.
  | 'baza-izbor'
  // Trka za slobodne teritorije.
  | 'osvajanje-pitanje'
  | 'osvajanje-odgovor'
  | 'osvajanje-rezultat'
  | 'osvajanje-izbor'
  // Rat.
  | 'napad-izbor'
  | 'duel-pitanje'
  | 'duel-odgovor'
  | 'duel-broj'
  | 'duel-rezultat'
  | 'rezultat'
  | 'ended';

/** Stanje jedne teritorije u partiji. */
export interface BitkaTerritoryState {
  id: string;
  /** null = neutralna. */
  ownerId: string | null;
  castle: boolean;
  /** Preostali zidovi; ima smisla samo kad je `castle`. */
  walls: number;
}

export interface BitkaPlayerView {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  score: number;
  /** Koliko teritorija drži (zamak se broji). */
  territories: number;
  /** Preostali zidovi zamka; 0 kad je zamak pao. */
  walls: number;
  eliminated: boolean;
  /** 1 = najbolji rezultat na pitanju redosleda; taj prvi bira zamak. */
  priority: number;
}

/** Pitanje kakvo se šalje na ekran — nikad sa tačnim odgovorom. */
export interface BitkaQuestionView {
  kind: 'izbor' | 'broj';
  text: string;
  imageUrl?: string;
  /** kind === 'izbor' */
  options?: { index: number; text: string; color: string }[];
  /** kind === 'broj' */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

/** Rezultat jednog igrača na upravo završenom pitanju. */
export interface BitkaAnswerResult {
  playerId: string;
  /** Za izborna pitanja; null ako nije stigao. */
  optionIndex?: number | null;
  /** Za broj-pitanja; null ako nije stigao. */
  value?: number | null;
  correct: boolean;
  /** Sekunde do odgovora — TV prikazuje redosled biranja. */
  seconds: number | null;
}

/**
 * Koliko partija traje.
 *
 * `zamkovi` — rat ide dok ne ostane samo jedan zamak. Prirodan kraj igre, ali
 * ume da potraje.
 *
 * `runde` — igra se unapred dogovoren broj ratnih rundi (`BITKA_RUNDE_IZBOR`),
 * pa pobeđuje najveći zbir poena. Za kad se zna koliko vremena ima.
 *
 * Smena poteza NE zavisi od moda: potez se uvek rotira, osim kad se opseda
 * zamak — tada napadač nastavlja dok god ruši zidove (vidi `duel-rezultat`).
 */
export type BitkaMode = 'zamkovi' | 'runde';

export type BitkaDuelOutcome =
  | 'napadac'        // napadač uzima teritoriju
  | 'branilac'       // odbrana uspela
  | 'zid'            // zamak izgubio jedan zid
  | 'zamak-pao';     // zamak pao, branilac ispao

export interface BitkaDuelView {
  attackerId: string;
  /** null kad se napada neutralna teritorija. */
  defenderId: string | null;
  territoryId: string;
  /** Napad na zamak — TV prikazuje zidove umesto obične zastavice. */
  onCastle: boolean;
  // Tokom `duel-odgovor` / `duel-broj` idu SAMO ove dve zastavice.
  attackerCommitted: boolean;
  defenderCommitted: boolean;
  /** Popunjeno tek u `duel-rezultat`. */
  outcome?: BitkaDuelOutcome;
  /** Tačan odgovor, tek u `duel-rezultat`. */
  correctIndex?: number;
  correctValue?: number;
  results?: BitkaAnswerResult[];
}

export interface BitkaLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  score: number;
  territories: number;
  rank: number;
}

/** Broadcast polovina — vidi je i TV i svaki telefon. */
export interface BitkaHostData {
  phase: BitkaPhase;
  map: BitkaMapView;
  board: BitkaTerritoryState[];
  players: BitkaPlayerView[];
  /** Ratna runda (pun krug napada); 0 dok rat nije počeo. */
  round: number;
  totalRounds: number;
  /** Runda osvajanja, dok traje faza osvajanja. */
  osvajanjeRound?: number;

  /** Pitanje bez odgovora. */
  question?: BitkaQuestionView;
  /** Ko je već potvrdio — samo id-jevi, nikad šta je izabrao. */
  answeredIds?: string[];
  expectedIds?: string[];

  /** Otkrivanje posle pitanja — tek u `*-rezultat` fazama. */
  correctIndex?: number;
  correctValue?: number;
  results?: BitkaAnswerResult[];

  /** Ko trenutno bira (osvajanje-izbor, napad-izbor). */
  activePlayerId?: string | null;
  /** Redosled biranja u `osvajanje-izbor` — TV prikazuje red čekanja. */
  pickQueue?: string[];
  /** Teritorije koje aktivni igrač sme da izabere. */
  selectableIds?: string[];
  /** Ko je već potvrdio bazu — bez otkrivanja koju (anti-leak). */
  baseCommittedIds?: string[];

  duel?: BitkaDuelView;

  /** Po kom pravilu se smenjuju napadi — TV to ispisuje uz rundu. */
  mode?: BitkaMode;

  /** Kratak srpski banner o poslednjem ishodu ("Pera je uzeo Porodin"). */
  lastEvent?: string;

  leaderboard?: BitkaLeaderboardEntry[];
  winnerId?: string | null;
}

/** Privatna polovina — samo u `playerData[playerId]`. */
export interface BitkaControllerData {
  /** Ovaj igrač je trenutno na potezu / na njega se čeka. */
  isActive?: boolean;
  /** Uloga u tekućem duelu. */
  duelRole?: 'napadac' | 'branilac' | 'posmatrac';
  hasAnswered?: boolean;
  /** Šta je OVAJ igrač izabrao — nikad ne ide u broadcast. */
  selectedIndex?: number | null;
  myGuess?: number | null;
  /** Teritorije koje ovaj igrač sme da tapne, ako je na njemu red. */
  selectableIds?: string[];
  /** Njegov izbor baze dok traje `baza-izbor` (drugi ga ne vide). */
  myBaseChoice?: string | null;
  myTerritoryIds?: string[];
  eliminated?: boolean;
  score?: number;
  /** Poruka namenjena samo njemu ("Izgubio si Porodin"). */
  lastOutcome?: string;
}
