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

import type { KvizValueType } from './quiz.js';

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
  // Otkrivanje izbornog pitanja duela — ostaje na ekranu pitanja, pre nego
  // što se ode na broj (nerešeno) ili na mapu (ishod).
  | 'duel-odgovor-rezultat'
  | 'duel-broj'
  // Otkrivanje broja koji je razrešio nerešen duel — tačna vrednost, obe
  // procene i ko je bio brži.
  | 'duel-broj-rezultat'
  // Ishod napada u prozoru preko ekrana; tabla se još NIJE promenila.
  | 'duel-ishod'
  | 'duel-rezultat'
  // Nema zasebnog završnog ekrana — `ended` odmah predaje platformskom ekranu
  // sa poenima i diplomama.
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
  kind: 'izbor' | 'broj' | 'matrica' | 'redosled' | 'domino' | 'tekst';
  /**
   * Runtime id pitanja — telefon ga kači uz prijavu „netačno" i uz ocenu.
   * Nije osetljiv: ne nosi nijedan deo odgovora, a bez njega igrač ne može da
   * prijavi pitanje koje je već otišlo sa ekrana.
   */
  id?: string;
  text: string;
  imageUrl?: string;
  /**
   * Ime paka iz kog je pitanje — kategorija na telefonu, isto kao `packName`
   * u Kvizu. Metapodatak sa strane pitanja: ne nosi nijedan deo odgovora, pa
   * sme u broadcast. Nema ga za ugrađenu banku i za broj-pitanja.
   */
  packName?: string;
  /** kind === 'izbor' */
  options?: { index: number; text: string; color: string }[];
  /** kind === 'broj' */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /**
   * kind === 'matrica' — svih 9 pojmova mreže. Sami pojmovi su javni (bez njih
   * nema pitanja); tačna trojka i objašnjenje ostaju na serveru do otkrivanja.
   */
  cells?: string[];
  /** kind === 'matrica' — koliko ćelija treba izabrati (uvek 3 zasad). */
  pick?: number;
  /**
   * kind === 'redosled' — pojmovi u IZMEŠANOM redosledu, isti za sve. Tačan
   * poredak ostaje na serveru do otkrivanja.
   */
  items?: string[];
  /**
   * kind === 'domino' — natpisi na dva dugmeta i koliko koraka niz nosi.
   * Sam niz i njegove vrednosti NE idu ovde: svaki igrač hoda svoj korak i
   * dobija ga kroz `playerData`, pa cela lista nikad ne stoji u broadcastu.
   */
  lowerLabel?: string;
  higherLabel?: string;
  steps?: number;
  /** kind === 'domino' | 'broj' — kako se vrednost ispisuje. */
  valueType?: KvizValueType;
  /**
   * kind === 'tekst' — koji je od tri tipa slobodnog teksta, jer se svaki
   * drugačije postavlja: emoji nosi zagonetku, citat početak rečenice,
   * anagram izmešana slova.
   */
  textKind?: 'emoji' | 'dopuna' | 'anagram';
  /** textKind === 'emoji' — emoji koji JESU pitanje, plus kategorija. */
  emojis?: string;
  category?: string;
  /** textKind === 'dopuna' — vidljivi deo citata; nastavak je odgovor. */
  quote?: string;
  /**
   * textKind === 'anagram' — izmešana slova odgovora. U Kvizu se ona
   * postepeno slažu kako vreme ističe; ovde su fiksna, jer duel traje 20 s i
   * postepeno otkrivanje bi mu dodalo stanje i još jednu površinu curenja.
   */
  scramble?: string;
}

/** Rezultat jednog igrača na upravo završenom pitanju. */
export interface BitkaAnswerResult {
  playerId: string;
  /** Za izborna pitanja; null ako nije stigao. */
  optionIndex?: number | null;
  /** Za broj-pitanja; null ako nije stigao. */
  value?: number | null;
  /** Za matricu — indeksi ćelija koje je izabrao; null ako nije stigao. */
  cells?: number[] | null;
  /** Za redosled — njegov poredak kao indeksi u `items`; null ako nije stigao. */
  order?: number[] | null;
  /** Za domino — dokle je stigao niz pre prve greške. */
  streak?: number | null;
  /** Za tekstualna pitanja — šta je otkucao; null ako nije pogodio ni jednom. */
  text?: string | null;
  /**
   * Rezultat na pitanju, veće je bolje. Izborno pitanje daje 0 ili 1, matrica
   * 0–3. Duel se rešava poređenjem ovog broja, pa TV sme da ga i ispiše.
   */
  score?: number;
  /**
   * Da li je odgovor „dovoljno dobar" — kod izbornog pitanja tačan, kod
   * matrice bar dva od tri pojma. To je prag koji nosi zemlju u trci.
   */
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
  /**
   * U `duel-odgovor-rezultat`: posle otkrivanja NE ide mapa nego broj-pitanje,
   * jer su oba duelanta odgovorila isto. Ekran koji to kaže mora da zna unapred
   * — inače najavi ishod koji ne stiže.
   */
  tiebreakPending?: boolean;
  /**
   * Isti napadač nastavlja opsadu istog zamka posle srušenog zida. Kartica sa
   * najavom se tada preskače — ista poruka tri puta zaredom je šum, a ne najava.
   */
  opsadaNastavak?: boolean;
  /**
   * Ishod u `duel-ishod` — dok stoji prozor sa porukom, a tabla je još stara.
   * NAMERNO nije `outcome`: efekti se izvode iz pojave `outcome`, pa bi mač
   * pao dok se poruka još čita, na mapu koja se nije ni promenila.
   */
  pendingOutcome?: BitkaDuelOutcome;
  /** Zidova posle udarca — poruka mora da važi i pre nego što se tabla upiše. */
  wallsAfter?: number;
  /** Popunjeno tek u `duel-rezultat`. */
  outcome?: BitkaDuelOutcome;
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
  /**
   * Domino, dok se igra: dokle je ko stigao. Sme u broadcast jer je to brojka
   * koraka, a ne sadržaj odgovora — svi hodaju isti niz, pa tuđi napredak ne
   * kaže ni jedan „pre/posle". Bez ovoga TV nema šta da prikaže dok dvoje
   * gaze niz, jer se odgovori ne šalju odjednom.
   */
  dominoProgress?: { playerId: string; streak: number; done: boolean }[];
  expectedIds?: string[];

  /** Otkrivanje posle pitanja — tek u `*-rezultat` fazama. */
  correctIndex?: number;
  correctValue?: number;
  /** Matrica: indeksi tačne trojke. Ide tek u otkrivanju, kao i `correctIndex`. */
  correctCells?: number[];
  /** Redosled: tačan poredak kao indeksi u `items`. Samo u otkrivanju. */
  correctOrder?: number[];
  /** Tekstualna pitanja: tačan odgovor. Samo u otkrivanju. */
  correctText?: string;
  /**
   * Domino: ceo niz sa vrednostima. Samo u otkrivanju — dok se igra, igrač
   * vidi isključivo svoj tekući korak, kroz `playerData`.
   */
  dominoChain?: { label: string; value: number }[];
  /** Matrica: rečenica koja objašnjava vezu, kad je pitanje nosi. */
  explanation?: string;
  results?: BitkaAnswerResult[];
  /**
   * Samo u `duel-rezultat` i samo kad je duel bio nerešen: pitanje sa brojem
   * koje ga je razrešilo, sa tačnom vrednošću i procenama duelanata.
   */

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
  /** Njegov izbor ćelija u matrici, dok traje pitanje (drugi ga ne vide). */
  selectedCells?: number[] | null;
  /** Njegov poredak u redosled-pitanju. */
  selectedOrder?: number[] | null;
  /** Šta je otkucao na tekstualnom pitanju kad je pogodio. */
  myText?: string | null;
  /** Poslednji promašen pokušaj — telefon ga pokazuje kao „nije to". */
  lastWrongText?: string | null;
  /**
   * Domino, korak po korak. Ceo niz NIKAD ne izlazi iz modula dok traje
   * pitanje — igrač dobija referencu (sa vrednošću) i sledeći pojam (bez nje),
   * pa je poređenje i dalje na njemu.
   */
  domino?: {
    reference: { label: string; value: number } | null;
    current: string | null;
    streak: number;
    done: boolean;
    steps: number;
  };
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
