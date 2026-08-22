import type {
  BitkaAnswerResult,
  BitkaControllerData,
  BitkaDuelView,
  BitkaHostData,
  BitkaMapView,
  BitkaPlayerView,
  BitkaQuestionView,
  BitkaTerritory,
  BitkaTerritoryState,
  DiplomaCandidate,
  GameState,
  KvizBrojQuestionFull,
  KvizChoiceQuestionFull,
  KvizDominoQuestionFull,
  KvizMatricaQuestionFull,
  KvizQuestionFull,
  KvizQuestionType,
  KvizRedosledQuestionFull,
  Room,
} from '@igra/shared';
import {
  BITKA_PITANJE_TYPES,
  BITKA_QUIZ_TYPES,
  BITKA_MAX_IGRACA,
  BITKA_MAX_OSVAJANJE_RUNDI,
  BITKA_MAX_RATNIH_RUNDI,
  BITKA_MIN_IGRACA,
  BITKA_RUNDE_DEF,
  BITKA_RUNDE_IZBOR,
  BITKA_ODBRANA_BONUS,
  BITKA_ZAMAK_BODOVI,
  BITKA_ZID_BONUS,
  BITKA_ZIDOVI,
  KVIZ_BANK_PACK_ID,
  QUIZ_QUESTION_BANK,
  checkEmojiGuess,
  checkTextGuess,
  bitkaMinTeritorija,
  shuffled,
  territoryValue,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { QuizFeedbackTracker } from '../../quiz-feedback-tracker.js';
import { getGameTimings } from '../../timing-config.js';
import { normalizeGuess } from '../quiz/scoring.js';
import { resolveQuizPack } from '../quiz/quiz-pack-resolver.js';
import {
  firstValidBitkaMapIdSync,
  resolveBitkaMapSync,
} from './bitka-map-resolver.js';
import { duelOutcome, resolveBrojDuel, resolveScoredDuel, type DuelSide } from './duel.js';
import type {
  BitkaAnswer,
  BitkaDominoProgress,
  BitkaInternalState,
  BitkaQuestionFull,
  BitkaStats,
  BitkaTextQuestionFull,
} from './BitkaState.js';
import {
  BAZA_IZBOR_DURATION,
  DUEL_REZULTAT_DURATION,
  DUEL_ISHOD_DURATION,
  DUEL_OTKRIVANJE_DURATION,
  IZBOR_DURATION,
  NAPAD_IZBOR_DURATION,
  ODGOVOR_DURATION,
  PITANJE_NAJAVA_DURATION,
  REZULTAT_DURATION,
  UVOD_DURATION,
  emptyStats,
} from './BitkaState.js';

interface BitkaStartOptions {
  bitkaMapId?: unknown;
  bitkaMode?: unknown;
  bitkaRounds?: unknown;
  quizPackIds?: unknown;
  quizTypes?: unknown;
}

/** Pak sa broj-pitanjima koji se dovlači kad izabrani pakovi nemaju nijedno. */
const BROJ_FALLBACK_PACK = 'pogodi-broj';

/**
 * Pitanja koja igra ume da postavi: izborna i matrica. Medija nema (TV već
 * nosi tablu, a hostless soba nema gde da je pusti), mape nema (mapa je već
 * bojno polje), kucanja nema (u duelu bi odlučivala brzina palca).
 */
function isBitkaQuestion(q: KvizQuestionFull): q is BitkaQuestionFull {
  return (BITKA_PITANJE_TYPES as string[]).includes(q.type);
}

function isChoiceQuestion(q: BitkaQuestionFull): q is KvizChoiceQuestionFull {
  return q.type === 'obicno' || q.type === 'uljez';
}

function isMatricaQuestion(q: BitkaQuestionFull): q is KvizMatricaQuestionFull {
  return q.type === 'matrica';
}

function isRedosledQuestion(q: BitkaQuestionFull): q is KvizRedosledQuestionFull {
  return q.type === 'redosled';
}

function isDominoQuestion(q: BitkaQuestionFull): q is KvizDominoQuestionFull {
  return q.type === 'domino';
}

function isTextQuestion(q: BitkaQuestionFull): q is BitkaTextQuestionFull {
  return q.type === 'emoji' || q.type === 'dopuna' || q.type === 'anagram';
}

function isBrojQuestion(q: KvizQuestionFull): q is KvizBrojQuestionFull {
  return q.type === 'broj';
}

/**
 * Izmešana slova odgovora za anagram — bez razmaka, velikim slovima.
 *
 * Za razliku od Kviza slova se NE slažu postepeno kako vreme prolazi: duel
 * traje 20 s, pa bi postepeno otkrivanje značilo još jedno stanje po pitanju i
 * još jednu površinu na kojoj tačan odgovor curi u broadcast.
 */
function scrambleOf(answer: string): string {
  const letters: string[] = [];
  for (const ch of answer.toUpperCase()) if (ch !== ' ') letters.push(ch);
  let pool = shuffled(letters);
  // Ako se izmeša u sam odgovor, promešaj opet — inače pitanje nije zagonetka.
  for (let tries = 0; tries < 5; tries++) {
    if (letters.length < 2 || pool.join('') !== letters.join('')) break;
    pool = shuffled(letters);
  }
  return pool.join('');
}

/**
 * Najveći mogući rezultat na pitanju.
 *
 * Stepenovani tipovi (matrica, redosled, domino) su ovde vredniji nego što
 * izgledaju: pošto duel poredi rezultate, oni razrešavaju sami sebe i ređe
 * šalju partiju na klizač. Tekstualni tipovi su binarni kao i izborni.
 */
function maxScoreOf(q: BitkaQuestionFull): number {
  if (isMatricaQuestion(q)) return q.correct.length;
  if (isRedosledQuestion(q)) return q.items.length;
  if (isDominoQuestion(q)) return Math.max(1, q.items.length - 1);
  return 1;
}

/**
 * Prag „dovoljno dobar" — polovina mogućeg, zaokruženo naviše.
 *
 * Za izborno pitanje to je 1 od 1, dakle doslovno staro pravilo; za matricu 2
 * od 3. Prag postoji samo zbog dva mesta gde nema s kim da se poredi: trke za
 * slobodnu zemlju (ko sme da bira) i napada na neutralnu teritoriju (nema
 * branioca). Duel dvoje igrača poredi sam rezultat, ne prag.
 */
function qualifyThreshold(q: BitkaQuestionFull): number {
  return Math.ceil(maxScoreOf(q) / 2);
}

/** Faze u kojima igrači aktivno odgovaraju na pitanje. */
const ANSWER_PHASES = new Set([
  'redosled-odgovor',
  'osvajanje-odgovor',
  'duel-odgovor',
  'duel-broj',
]);

/**
 * Osvajanje — Triviador/Konquiztador na mapi koja se crta u adminu. Od dvoje
 * do četvoro igrača, svako sa svojim zamkom: prvo se bira zamak, pa se kroz
 * pitanja grabi slobodna zemlja, pa se ide u rat gde svaki napad razrešava
 * duel. Koliko igrača mapa nosi zavisi od njene veličine — vidi `validateStart`.
 *
 * **Anti-leak** — `game:state-update` je broadcast, pa u `hostData` nikad ne
 * smeju: `correctIndex` i tačan broj pre faze rezultata, izbor baze dok traje
 * biranje (inače se prepisuje ili izbegava), i odgovori učesnika duela dok
 * duel traje. Tabla (vlasništvo, zidovi, geometrija mape) sme — telefon je
 * legitimno vidi i bez nje hostless mod ne radi.
 */
export class BitkaModule extends BaseGameModule {
  readonly gameId = 'osvajanje';

  private state!: BitkaInternalState;
  private timings: Record<string, number> = {};
  private territoryById = new Map<string, BitkaTerritory>();
  /**
   * id pitanja -> ime paka iz kog je došlo. Pool se pri učitavanju spljošti u
   * jednu listu, pa je ovo jedino mesto gde poreklo pitanja preživi — telefon
   * po njemu ispisuje kategoriju, isto kao u Kvizu. Ugrađena banka i rezervni
   * broj-pak nemaju ime i namerno ostaju bez natpisa.
   */
  private packNames = new Map<string, string>();
  /**
   * Prijave i ocene pitanja — isti knjigovođa kao u Kvizu, jer su i pitanja
   * ista. Bez ovoga bi pitanje prijavljeno u KvizAtaru ostalo neprijavljeno u
   * paketu iz koga je došlo.
   */
  private feedback = new QuizFeedbackTracker();

  constructor(
    private readonly packsDir: string,
    private readonly mapsDir: string
  ) {
    super();
  }

  validateStart(room: Room, customContent?: unknown): string | null {
    // Platforma proverava samo minimum, pa se gornja granica brani ovde —
    // svaki igrač mora da dobije svoj zamak.
    const connected = room.players.filter((p) => p.isConnected).length;
    if (connected > BITKA_MAX_IGRACA) {
      return `KvizAtar se igra u ${BITKA_MIN_IGRACA}–${BITKA_MAX_IGRACA} igrača — trenutno vas je ${connected}.`;
    }
    const map = this.pickMap(customContent, connected);
    if (!map) {
      return 'Nema nijedne ispravne mape — napravi je u /admin → Mape.';
    }
    // Koliko igrača mapa nosi zavisi od njene veličine, pa se to zna tek ovde.
    // Bez ove provere bi na tesnoj mapi poslednji na redu ostao bez mesta za
    // zamak, a osvajanje bi se ugasilo pre prve runde.
    const potrebno = bitkaMinTeritorija(connected);
    if (map.territories.length < potrebno) {
      return `Mapa „${map.name}" je premala za ${connected} igrača — treba joj bar ${potrebno} teritorija (ima ${map.territories.length}).`;
    }
    if (map.castleSites?.length && map.castleSites.length < connected) {
      return `Mapa „${map.name}" ima označena mesta za samo ${map.castleSites.length} zamka — a vas je ${connected}.`;
    }
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const cc = (customContent ?? {}) as BitkaStartOptions;

    // Isti broj igrača kao u `validateStart`, da rezervna mapa bude ista.
    const map = this.pickMap(
      customContent,
      room.players.filter((p) => p.isConnected).length
    )!;
    this.territoryById = new Map(map.territories.map((t) => [t.id, t]));

    const board = new Map<string, BitkaTerritoryState>();
    for (const t of map.territories) {
      board.set(t.id, { id: t.id, ownerId: null, castle: false, walls: 0 });
    }

    this.state = {
      phase: 'uvod',
      mode: cc.bitkaMode === 'runde' ? 'runde' : 'zamkovi',
      phaseTimeRemaining: this.timings.UVOD_DURATION ?? UVOD_DURATION,
      map,
      castleSites: map.castleSites?.length ? map.castleSites : null,
      board,
      loading: true,
      questionPool: [],
      brojPool: [],
      questionCursor: 0,
      brojCursor: 0,
      question: null,
      brojQuestion: null,
      shuffledItems: [],
      scramble: '',
      dominoProgress: new Map(),
      wrongText: new Map(),
      answers: new Map(),
      expected: new Set(),
      pendingAttackerWin: null,
      pendingBroj: null,
      pendingOutcome: null,
      pendingWalls: 0,
      priority: [],
      baseChoice: new Map(),
      baseQueue: [],
      osvajanjeRound: 0,
      pickQueue: [],
      round: 0,
      // Na runde: dogovoren broj i to je kraj partije. Do poslednjeg zamka:
      // ovo je samo osigurač od zaglavljene partije, ne pravilo igre.
      totalRounds:
        cc.bitkaMode === 'runde'
          ? (BITKA_RUNDE_IZBOR as readonly number[]).includes(Number(cc.bitkaRounds))
            ? Number(cc.bitkaRounds)
            : BITKA_RUNDE_DEF
          : BITKA_MAX_RATNIH_RUNDI,
      turnOrder: [],
      turnPointer: 0,
      activePlayerId: null,
      attacksThisRound: 0,
      duel: null,
      eliminated: new Set(),
      bonus: new Map(),
      stats: new Map(),
      lastEvent: '',
      lastOutcome: new Map(),
      winnerId: null,
    };

    const packIds = Array.isArray(cc.quizPackIds)
      ? (cc.quizPackIds.filter((v) => typeof v === 'string') as string[])
      : [];
    // Kao kod Kviza: onStart ne sme biti async, pa uvod čeka na pitanja.
    this.feedback.reset();
    this.packNames.clear();
    void this.loadPools(packIds, this.parseTypeFilter(cc.quizTypes));

    return this.buildGameState(room);
  }

  // --- Ulaz igrača ---------------------------------------------------------

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    // Prijava/ocena pitanja ne dira tok igre, pa prolazi u svakoj fazi — i
    // ispalom igraču, koji i dalje gleda partiju i sme da javi da je pitanje
    // netačno.
    if (action === 'quiz:feedback') {
      this.feedback.handle(playerId, data);
      return null;
    }
    if (this.state.eliminated.has(playerId)) return null;

    if (action === 'bitka:answer') return this.handleAnswer(room, playerId, data);
    if (action === 'bitka:matrica') return this.handleMatrica(room, playerId, data);
    if (action === 'bitka:order') return this.handleOrder(room, playerId, data);
    if (action === 'bitka:domino') return this.handleDomino(room, playerId, data);
    if (action === 'bitka:text') return this.handleText(room, playerId, data);
    if (action === 'bitka:guess') return this.handleGuess(room, playerId, data);
    if (action === 'bitka:pick') return this.handlePick(room, playerId, data);
    return null;
  }

  private handleAnswer(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    const phase = this.state.phase;
    if (phase !== 'redosled-odgovor' && phase !== 'osvajanje-odgovor' && phase !== 'duel-odgovor') {
      return null;
    }
    // `redosled` je broj-pitanje — na njega se odgovara sa bitka:guess.
    if (phase === 'redosled-odgovor') return null;

    const question = this.state.question;
    if (!question || !isChoiceQuestion(question)) return null;
    if (!this.state.expected.has(playerId)) return null;
    if (this.state.answers.has(playerId)) return null;

    const raw = data.optionIndex;
    if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
    if (raw < 0 || raw >= question.options.length) return null;

    const correct = raw === question.correctIndex;
    this.state.answers.set(playerId, {
      optionIndex: raw,
      remaining: Math.max(0, this.state.phaseTimeRemaining),
      score: correct ? 1 : 0,
      correct,
    });

    if (this.allAnswered(room)) this.advancePhase(room);
    return this.buildGameState(room);
  }

  /**
   * Matrica — igrač šalje tačno tri ćelije odjednom, jednom, kao i kod
   * izbornog pitanja. Kviz ovde daje delimične poene; ovde delimičan pogodak
   * nosi delimičan rezultat, pa 2:3 rešava duel bez klizača.
   */
  private handleMatrica(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    const phase = this.state.phase;
    if (phase !== 'osvajanje-odgovor' && phase !== 'duel-odgovor') return null;

    const question = this.state.question;
    if (!question || !isMatricaQuestion(question)) return null;
    if (!this.state.expected.has(playerId)) return null;
    if (this.state.answers.has(playerId)) return null;

    const raw = data.cells;
    if (!Array.isArray(raw) || raw.length !== question.correct.length) return null;
    const seen = new Set<number>();
    const cells: number[] = [];
    for (const v of raw) {
      if (
        typeof v !== 'number' ||
        !Number.isInteger(v) ||
        v < 0 ||
        v >= question.cells.length ||
        seen.has(v)
      ) {
        return null;
      }
      seen.add(v);
      cells.push(v);
    }

    const correctSet = new Set(question.correct);
    const score = cells.filter((v) => correctSet.has(v)).length;
    this.state.answers.set(playerId, {
      cells,
      remaining: Math.max(0, this.state.phaseTimeRemaining),
      score,
      correct: score >= qualifyThreshold(question),
    });

    if (this.allAnswered(room)) this.advancePhase(room);
    return this.buildGameState(room);
  }

  /**
   * Redosled — ceo poredak stiže odjednom, na „Potvrdi". Rezultat je broj
   * pojmova na tačnom mestu, pa 4:5 rešava duel bez klizača.
   */
  private handleOrder(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    const phase = this.state.phase;
    if (phase !== 'osvajanje-odgovor' && phase !== 'duel-odgovor') return null;

    const question = this.state.question;
    if (!question || !isRedosledQuestion(question)) return null;
    if (!this.state.expected.has(playerId)) return null;
    if (this.state.answers.has(playerId)) return null;

    const raw = data.order;
    const n = question.items.length;
    if (!Array.isArray(raw) || raw.length !== n) return null;
    const seen = new Set<number>();
    const order: number[] = [];
    for (const v of raw) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= n || seen.has(v)) {
        return null;
      }
      seen.add(v);
      order.push(v);
    }

    // `order` su indeksi u PRIKAZANU listu; tačan poredak je original, pa se
    // poređenje radi kroz `shuffledItems`.
    const shown = this.state.shuffledItems;
    let score = 0;
    for (let pos = 0; pos < order.length; pos++) {
      if (shown[order[pos]] === pos) score += 1;
    }

    this.state.answers.set(playerId, {
      order,
      remaining: Math.max(0, this.state.phaseTimeRemaining),
      score,
      correct: score >= qualifyThreshold(question),
    });

    if (this.allAnswered(room)) this.advancePhase(room);
    return this.buildGameState(room);
  }

  /**
   * Domino — jedini tip koji se ne šalje odjednom: igrač hoda niz korak po
   * korak i staje na prvoj grešci. Zato se u `answers` upisuje tek kad je
   * gotov; ko ne stigne do kraja dobija svoj delimičan niz na isteku faze
   * (`materializePartial`), inače bi trud do greške vredeo nula.
   */
  private handleDomino(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    const phase = this.state.phase;
    if (phase !== 'osvajanje-odgovor' && phase !== 'duel-odgovor') return null;

    const question = this.state.question;
    if (!question || !isDominoQuestion(question)) return null;
    if (!this.state.expected.has(playerId)) return null;

    const dir = data.answer;
    if (dir !== 'before' && dir !== 'after') return null;

    const items = question.items;
    const prog = this.dominoProgressOf(playerId);
    if (prog.done || prog.pos >= items.length) return null;

    const correctDir = items[prog.pos].value >= items[prog.pos - 1].value ? 'after' : 'before';
    if (dir === correctDir) {
      prog.streak += 1;
      prog.pos += 1;
      if (prog.pos >= items.length) prog.done = true;
    } else {
      prog.done = true;
    }
    this.state.dominoProgress.set(playerId, prog);

    if (prog.done) {
      this.state.answers.set(playerId, {
        streak: prog.streak,
        remaining: Math.max(0, this.state.phaseTimeRemaining),
        score: prog.streak,
        correct: prog.streak >= qualifyThreshold(question),
      });
      if (this.allAnswered(room)) this.advancePhase(room);
    }
    return this.buildGameState(room);
  }

  /**
   * Emoji / citat / anagram — slobodan tekst.
   *
   * Ovo je jedini unos u igri koji sme da se ponavlja: promašaj ne troši
   * odgovor, jer bi tipfeler inače koštao zamka, a proveravanje već toleriše
   * sitne greške u kucanju. Cena je da faza ide do kraja kad neko ne pogodi —
   * rani izlazak radi samo kad SVI pogode. To je svesna razmena, i razlog zašto
   * tekstualne tipove treba čekirati namerno.
   */
  private handleText(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    const phase = this.state.phase;
    if (phase !== 'osvajanje-odgovor' && phase !== 'duel-odgovor') return null;

    const question = this.state.question;
    if (!question || !isTextQuestion(question)) return null;
    if (!this.state.expected.has(playerId)) return null;
    if (this.state.answers.has(playerId)) return null;

    const raw = typeof data.text === 'string' ? data.text.trim() : '';
    if (!raw) return null;

    const solved =
      question.type === 'emoji'
        ? checkEmojiGuess(raw, question)
        : checkTextGuess(raw, question);

    if (!solved) {
      this.state.wrongText.set(playerId, raw);
      return this.buildGameState(room);
    }

    this.state.wrongText.delete(playerId);
    this.state.answers.set(playerId, {
      text: raw,
      remaining: Math.max(0, this.state.phaseTimeRemaining),
      score: 1,
      correct: true,
    });

    if (this.allAnswered(room)) this.advancePhase(room);
    return this.buildGameState(room);
  }

  private dominoProgressOf(playerId: string): BitkaDominoProgress {
    return (
      this.state.dominoProgress.get(playerId) ?? { pos: 1, streak: 0, done: false }
    );
  }

  /**
   * Domino se ne šalje odjednom, pa na isteku faze igrači koji nisu stigli do
   * kraja nemaju nijedan upis. Bez ovoga bi niz od četiri tačna koraka vredeo
   * isto koliko i nijedan.
   */
  private materializePartial(): void {
    const question = this.state.question;
    if (!question || !isDominoQuestion(question)) return;
    for (const id of this.state.expected) {
      if (this.state.answers.has(id)) continue;
      const prog = this.state.dominoProgress.get(id);
      const streak = prog?.streak ?? 0;
      this.state.answers.set(id, {
        streak,
        // Ko nije stigao do kraja nije ni „potvrdio", pa mu brzina ne pomaže u
        // izjednačenju — 0 preostalih sekundi je tačno to.
        remaining: 0,
        score: streak,
        correct: streak >= qualifyThreshold(question),
      });
    }
  }

  private handleGuess(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    const phase = this.state.phase;
    if (phase !== 'redosled-odgovor' && phase !== 'duel-broj') return null;

    const question = this.state.brojQuestion;
    if (!question) return null;
    if (!this.state.expected.has(playerId)) return null;
    if (this.state.answers.has(playerId)) return null;

    const raw = data.value;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;

    this.state.answers.set(playerId, {
      value: normalizeGuess(raw, question),
      remaining: Math.max(0, this.state.phaseTimeRemaining),
      // Kod broj-pitanja „tačno" znači samo da je odgovorio — poređenje je
      // relativno (ko je bliži), pa se ishod računa pri razrešenju. Isto važi
      // za `score`: nosi ga `distance`, ne ovaj broj.
      score: 1,
      correct: true,
    });

    if (this.allAnswered(room)) this.advancePhase(room);
    return this.buildGameState(room);
  }

  private handlePick(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    const territoryId = typeof data.territoryId === 'string' ? data.territoryId : '';
    if (!this.territoryById.has(territoryId)) return null;

    if (this.state.phase === 'baza-izbor') {
      // Bira samo onaj ko je na potezu, i izbor je konačan — sledeći igrač ga
      // vidi na mapi i bira u odnosu na njega.
      if (playerId !== this.state.activePlayerId) return null;
      if (!this.baseEligibleIds().includes(territoryId)) return null;
      this.commitBase(room, playerId, territoryId);
      this.advanceBaseTurn(room);
      return this.buildGameState(room);
    }

    if (this.state.phase === 'osvajanje-izbor') {
      if (playerId !== this.state.activePlayerId) return null;
      if (!this.freePickTargets(playerId).includes(territoryId)) return null;
      this.claimFree(room, playerId, territoryId);
      return this.buildGameState(room);
    }

    if (this.state.phase === 'napad-izbor') {
      if (playerId !== this.state.activePlayerId) return null;
      if (!this.attackTargets(playerId).includes(territoryId)) return null;
      this.beginDuel(room, playerId, territoryId);
      return this.buildGameState(room);
    }

    return null;
  }

  // --- Sat -----------------------------------------------------------------

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;
    this.state.phaseTimeRemaining -= deltaMs / 1000;
    if (this.state.phaseTimeRemaining > 0) return this.buildGameState(room);
    this.advancePhase(room);
    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    // Stiže tek kad istekne grejs — do tada je igrač samo posivio.
    if (this.state.phase === 'ended') return null;
    if (this.state.eliminated.has(playerId)) return null;

    this.state.expected.delete(playerId);
    this.state.answers.delete(playerId);
    this.state.baseChoice.delete(playerId);
    this.state.pickQueue = this.state.pickQueue.filter((id) => id !== playerId);
    this.state.baseQueue = this.state.baseQueue.filter((id) => id !== playerId);

    // Zemlja odlazi u neutralno, a ne protivniku — nagrada za tuđi pad
    // pokvarila bi trku.
    for (const st of this.state.board.values()) {
      if (st.ownerId !== playerId) continue;
      st.ownerId = null;
      st.castle = false;
      st.walls = 0;
    }
    this.state.eliminated.add(playerId);
    this.state.lastEvent = `${this.nameOf(room, playerId)} je napustio bitku.`;
    this.recomputeScores(room);

    // Ako je otišao usred duela ili na svom potezu, potez se ne čeka.
    if (this.state.duel && (this.state.duel.attackerId === playerId || this.state.duel.defenderId === playerId)) {
      this.state.duel = null;
      this.nextAttack(room);
    } else if (this.state.activePlayerId === playerId) {
      if (this.state.phase === 'napad-izbor') this.nextAttack(room);
      else if (this.state.phase === 'osvajanje-izbor') this.nextPicker(room);
      // Otišao je dok je bio na potezu za zamak — red ide dalje bez njega.
      else if (this.state.phase === 'baza-izbor') this.startBaseTurn(room);
    } else if (ANSWER_PHASES.has(this.state.phase) && this.allAnswered(room)) {
      this.advancePhase(room);
    }

    return this.buildGameState(room);
  }

  // --- Tok faza ------------------------------------------------------------

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'uvod':
        // Pitanja se još učitavaju — proveri ponovo za sekundu.
        if (this.state.loading) {
          this.state.phaseTimeRemaining = 1;
          return;
        }
        this.beginRedosled(room);
        break;

      case 'redosled-pitanje':
        this.state.phase = 'redosled-odgovor';
        this.state.phaseTimeRemaining = ODGOVOR_DURATION;
        break;
      case 'redosled-odgovor':
        this.finishRedosled(room);
        break;
      case 'redosled-rezultat':
        this.beginBaza(room);
        break;

      case 'baza-izbor':
        this.autoPlaceBase(room);
        break;

      case 'osvajanje-pitanje':
        this.state.phase = 'osvajanje-odgovor';
        this.state.phaseTimeRemaining = ODGOVOR_DURATION;
        break;
      case 'osvajanje-odgovor':
        this.finishOsvajanjeOdgovor(room);
        break;
      case 'osvajanje-rezultat':
        this.nextPicker(room, true);
        break;
      case 'osvajanje-izbor':
        this.autoPickFree(room);
        break;

      case 'napad-izbor':
        this.state.lastEvent = `${this.nameOf(room, this.state.activePlayerId)} nije napao.`;
        this.nextAttack(room);
        break;
      case 'duel-pitanje':
        this.state.phase = 'duel-odgovor';
        this.state.phaseTimeRemaining = ODGOVOR_DURATION;
        break;
      case 'duel-odgovor':
        this.finishDuelOdgovor(room);
        break;
      // Otkrivanje je odigrano — tek sad se posledica upisuje na tablu, ili se
      // ide na broj koji razrešava nerešeno.
      case 'duel-odgovor-rezultat':
        if (!this.state.duel) {
          this.nextAttack(room);
          break;
        }
        if (this.state.pendingBroj) this.beginDuelBroj();
        else this.applyDuel(room, !!this.state.pendingAttackerWin, false);
        break;
      case 'duel-broj':
        this.finishDuelBroj(room);
        break;
      case 'duel-broj-rezultat':
        if (!this.state.duel) {
          this.nextAttack(room);
          break;
        }
        this.applyDuel(room, !!this.state.pendingAttackerWin, false);
        break;
      // Poruka je odstajala — tek sad posledica ulazi u tablu, i tek sad
      // krenu efekti, jer se oni izvode iz razlike dve table.
      case 'duel-ishod':
        if (!this.state.duel) {
          this.nextAttack(room);
          break;
        }
        this.applyDuel(room, !!this.state.pendingAttackerWin, true);
        break;
      case 'duel-rezultat': {
        // Opsada traje dok napadač pogađa: srušen zid → odmah novo pitanje na
        // ISTOM zamku, bez prepuštanja poteza. Nema opasnosti od beskonačnog
        // niza — svaki pogodak skida po jedan zid, pa posle najviše tri udarca
        // zamak padne i potez svakako ide dalje. Nema ni dosade za ostale:
        // u opsadi su oba igrača za telefonom.
        const duel = this.state.duel;
        if (
          duel?.outcome === 'zid' &&
          !this.state.eliminated.has(duel.attackerId) &&
          room.players.some((p) => p.id === duel.attackerId)
        ) {
          this.state.lastEvent = `${this.nameOf(room, duel.attackerId)} nastavlja opsadu.`;
          this.beginDuel(room, duel.attackerId, duel.territoryId, true);
          break;
        }
        this.nextAttack(room);
        break;
      }
    }
  }

  // --- Redosled ------------------------------------------------------------

  private beginRedosled(room: Room): void {
    const alive = this.alivePlayerIds(room);
    const question = this.nextBroj();
    if (!question) {
      // Bez broj-pitanja nema uvodnog merenja — redosled je nasumičan.
      this.state.priority = shuffled(alive);
      this.state.lastEvent = 'Nema broj-pitanja u paketima — redosled je izvučen nasumično.';
      this.beginBaza(room);
      return;
    }
    this.setQuestion(null);
    this.state.brojQuestion = question;
    this.state.expected = new Set(alive);
    this.state.phase = 'redosled-pitanje';
    this.state.phaseTimeRemaining =
      this.timings.PITANJE_NAJAVA_DURATION ?? PITANJE_NAJAVA_DURATION;
  }

  private finishRedosled(room: Room): void {
    const question = this.state.brojQuestion!;
    const alive = this.alivePlayerIds(room);
    this.state.priority = [...alive].sort((a, b) => {
      const da = this.guessDistance(a, question.answer);
      const db = this.guessDistance(b, question.answer);
      if (da !== db) return da - db;
      return (this.state.answers.get(b)?.remaining ?? -1) - (this.state.answers.get(a)?.remaining ?? -1);
    });
    const first = this.state.priority[0];
    this.state.lastEvent = first
      ? `${this.nameOf(room, first)} je najbliži — bira zamak prvi.`
      : '';
    this.state.phase = 'redosled-rezultat';
    this.state.phaseTimeRemaining = this.timings.REZULTAT_DURATION ?? REZULTAT_DURATION;
  }

  // --- Izbor baze ----------------------------------------------------------

  /**
   * Zamkovi se postavljaju **naizmenično**, po redosledu iz uvodnog pitanja.
   *
   * Ranije su svi birali istovremeno naslepo, pa su se sudari oko istog mesta
   * rešavali prioritetom i ponovnim krugovima — što je bilo i sporo i pomalo
   * nasumično. Sad prvi bira onaj ko je najbolje pogodio uvodno pitanje, svaki
   * postavljen zamak se odmah vidi na mapi, a ko bira kasnije bira taktički.
   * Sudara više nema, pa je i cela mašinerija ponavljanja otišla.
   */
  private beginBaza(room: Room): void {
    this.state.phase = 'baza-izbor';
    this.state.baseChoice = new Map();
    this.state.answers = new Map();
    this.state.expected = new Set();
    this.state.baseQueue = this.state.priority.filter((id) =>
      this.alivePlayerIds(room).includes(id)
    );
    // Ko nije stigao u `priority` (nije odgovorio) ide na kraj reda.
    for (const id of this.alivePlayerIds(room)) {
      if (!this.state.baseQueue.includes(id)) this.state.baseQueue.push(id);
    }
    this.startBaseTurn(room);
  }

  /** Pusti sledećeg na red; kad se red isprazni, kreće osvajanje. */
  private startBaseTurn(room: Room): void {
    this.state.baseQueue = this.state.baseQueue.filter(
      (id) => !this.state.eliminated.has(id) && room.players.some((p) => p.id === id)
    );
    const next = this.state.baseQueue[0];
    if (!next || this.baseEligibleIds().length === 0) {
      this.finishBaza(room);
      return;
    }
    this.state.activePlayerId = next;
    this.state.phaseTimeRemaining = BAZA_IZBOR_DURATION;
  }

  /** Zamak je postavljen (ili dodeljen) — sledeći igrač. */
  private advanceBaseTurn(room: Room): void {
    this.state.baseQueue.shift();
    this.startBaseTurn(room);
  }

  /** Teritorije na koje sme zamak i koje još nisu zauzete. */
  private baseEligibleIds(): string[] {
    const sites = this.state.castleSites;
    return [...this.state.board.values()]
      .filter((st) => st.ownerId === null)
      .map((st) => st.id)
      .filter((id) => !sites || sites.includes(id));
  }

  /** Postavi zamak i objavi ga — svi ga odmah vide na mapi. */
  private commitBase(room: Room, playerId: string, territoryId: string): void {
    this.placeCastle(playerId, territoryId);
    this.state.baseChoice.set(playerId, territoryId);
    this.state.lastEvent = `${this.nameOf(room, playerId)} diže zamak u ${this.territoryName(
      territoryId
    )}.`;
    this.recomputeScores(room);
  }

  /** Vreme je isteklo — mesto se dodeljuje nasumično, potez se ne preskače. */
  private autoPlaceBase(room: Room): void {
    const playerId = this.state.activePlayerId;
    const free = shuffled(this.baseEligibleIds());
    if (playerId && free.length > 0) this.commitBase(room, playerId, free[0]);
    this.advanceBaseTurn(room);
  }

  private finishBaza(room: Room): void {
    this.state.activePlayerId = null;

    // Ko je ostao bez mesta (odustao usred faze, mapa se popunila) dobija ono
    // što je preostalo — partija ne sme da krene sa igračem bez zamka.
    const withoutCastle = this.alivePlayerIds(room).filter(
      (id) => ![...this.state.board.values()].some((st) => st.castle && st.ownerId === id)
    );
    for (const id of withoutCastle) {
      const free = shuffled(this.baseEligibleIds());
      if (free.length === 0) break;
      this.placeCastle(id, free[0]);
      this.state.baseChoice.set(id, free[0]);
    }

    this.recomputeScores(room);
    // Redosled poteza prati uvodno merenje.
    this.state.turnOrder = this.state.priority.filter((id) =>
      room.players.some((p) => p.id === id)
    );
    this.state.lastEvent = 'Zamkovi su podignuti — počinje osvajanje.';
    this.beginOsvajanje(room);
  }

  private placeCastle(playerId: string, territoryId: string): void {
    const st = this.state.board.get(territoryId);
    if (!st) return;
    st.ownerId = playerId;
    st.castle = true;
    st.walls = BITKA_ZIDOVI;
  }

  // --- Osvajanje -----------------------------------------------------------

  private beginOsvajanje(room: Room): void {
    if (this.freeTerritoryIds().length === 0) {
      this.beginRat(room);
      return;
    }
    if (this.state.osvajanjeRound >= BITKA_MAX_OSVAJANJE_RUNDI) {
      this.state.lastEvent = 'Ostatak mape ostaje ničiji — u rat!';
      this.beginRat(room);
      return;
    }

    const question = this.nextQuestion();
    if (!question) {
      this.beginRat(room);
      return;
    }
    this.state.osvajanjeRound += 1;
    this.state.lastOutcome.clear();
    this.setQuestion(question);
    this.state.expected = new Set(this.alivePlayerIds(room));
    this.state.pickQueue = [];
    this.state.activePlayerId = null;
    this.state.phase = 'osvajanje-pitanje';
    this.state.phaseTimeRemaining =
      this.timings.PITANJE_NAJAVA_DURATION ?? PITANJE_NAJAVA_DURATION;
  }

  private finishOsvajanjeOdgovor(room: Room): void {
    this.materializePartial();
    for (const id of this.state.expected) {
      const answer = this.state.answers.get(id);
      const stats = this.statsFor(id);
      if (answer?.correct) stats.tacnih += 1;
      else stats.netacnih += 1;
    }
    // Ko je prešao prag bira, bolji rezultat bira pre slabijeg, a na istom
    // rezultatu brži pre sporijeg. Kod izbornog pitanja su svi rezultati 0 ili
    // 1, pa se ovo svodi na staro pravilo „tačni po brzini"; matrica time
    // razdvaja 3:3 od 2:3 bez ijedne posebne grane.
    this.state.pickQueue = [...this.state.expected]
      .filter((id) => this.state.answers.get(id)?.correct)
      .sort((a, b) => {
        const aa = this.state.answers.get(a);
        const bb = this.state.answers.get(b);
        const ds = (bb?.score ?? 0) - (aa?.score ?? 0);
        if (ds !== 0) return ds;
        return (bb?.remaining ?? 0) - (aa?.remaining ?? 0);
      });
    // Poruka o ishodu mora da se napiše i kad ishoda NEMA: inače na ekranu
    // ostane rečenica iz prethodne runde („Pera uzima Porodin"), pa izgleda
    // kao da se upravo desilo nešto što se nije.
    this.state.lastEvent =
      this.state.pickQueue.length === 0
        ? 'Niko nije odgovorio tačno — niko ne uzima zemlju.'
        : `Tačno: ${this.state.pickQueue.map((id) => this.nameOf(room, id)).join(', ')}.`;

    // Otkrivanje ima svoju fazu i ostaje na ekranu PITANJA: tu se vidi ko je
    // šta odabrao i koji je odgovor tačan. Tek sledeći ekran je izbor
    // teritorije, i on je čist — bez pitanja.
    this.state.phase = 'osvajanje-rezultat';
    this.state.phaseTimeRemaining = this.timings.REZULTAT_DURATION ?? REZULTAT_DURATION;
  }

  /** Pusti sledećeg iz reda da bira; kad se red isprazni, nova runda. */
  private nextPicker(room: Room, fresh = false): void {
    if (!fresh) this.state.pickQueue.shift();
    this.state.pickQueue = this.state.pickQueue.filter(
      (id) => !this.state.eliminated.has(id) && room.players.some((p) => p.id === id)
    );

    if (this.state.pickQueue.length === 0 || this.freeTerritoryIds().length === 0) {
      this.state.activePlayerId = null;
      this.beginOsvajanje(room);
      return;
    }
    this.state.activePlayerId = this.state.pickQueue[0];
    this.state.phase = 'osvajanje-izbor';
    this.state.phaseTimeRemaining = IZBOR_DURATION;
  }

  private claimFree(room: Room, playerId: string, territoryId: string): void {
    const st = this.state.board.get(territoryId);
    if (!st) return;
    st.ownerId = playerId;
    this.recomputeScores(room);
    this.state.lastEvent = `${this.nameOf(room, playerId)} uzima ${this.territoryName(territoryId)}.`;
    this.nextPicker(room);
  }

  /**
   * Slobodne teritorije koje igrač sme da uzme: **samo one uz njegovu zemlju**,
   * da bi država rasla u komadu a ne u mrljama po mapi. Ako mu je sve susedno
   * već zauzeto, otvara se cela mapa — inače bi opkoljen igrač ostao bez poteza.
   */
  private freePickTargets(playerId: string): string[] {
    const free = this.freeTerritoryIds();
    const adjacent = free.filter((id) =>
      (this.territoryById.get(id)?.neighbors ?? []).some(
        (n) => this.state.board.get(n)?.ownerId === playerId
      )
    );
    return adjacent.length > 0 ? adjacent : free;
  }

  /**
   * Istekao je tajmer za biranje. Igrač je pitanje pogodio, pa mu zemlja i
   * pripada — bira se umesto njega, iz istog skupa koji bi i sam imao.
   */
  private autoPickFree(room: Room): void {
    const playerId = this.state.activePlayerId;
    if (!playerId) {
      this.nextPicker(room);
      return;
    }
    const pool = this.freePickTargets(playerId);
    if (pool.length === 0) {
      this.nextPicker(room);
      return;
    }
    this.claimFree(room, playerId, shuffled(pool)[0]);
  }

  // --- Rat -----------------------------------------------------------------

  private beginRat(room: Room): void {
    this.state.round = 1;
    this.state.attacksThisRound = 0;
    this.state.turnPointer = 0;
    this.state.pickQueue = [];
    this.state.lastEvent = 'Mapa je podeljena — počinje rat.';
    this.beginAttackTurn(room, true);
  }

  private beginAttackTurn(room: Room, firstOfRound = false): void {
    const alive = this.aliveInOrder(room);
    if (alive.length <= 1) {
      this.finishGame(room);
      return;
    }
    if (this.state.round > this.state.totalRounds) {
      this.finishGame(room);
      return;
    }

    // Nađi sledećeg živog počev od pokazivača. Kad neko ispadne, potez se
    // pravi ponovo na istom indeksu — inkrementiranje bi preskočilo sledećeg.
    const order = this.state.turnOrder;
    let picked: string | null = null;
    for (let i = 0; i < order.length; i++) {
      const idx = (this.state.turnPointer + i) % order.length;
      if (alive.includes(order[idx])) {
        this.state.turnPointer = idx;
        picked = order[idx];
        break;
      }
    }
    if (!picked) {
      this.finishGame(room);
      return;
    }
    if (firstOfRound) this.state.attacksThisRound = 0;

    // Poruke iz prethodnog poteza se ne prenose u sledeći.
    this.state.lastOutcome.clear();
    this.state.activePlayerId = picked;
    this.state.duel = null;
    this.setQuestion(null);
    this.state.expected = new Set();
    this.state.phase = 'napad-izbor';
    this.state.phaseTimeRemaining = NAPAD_IZBOR_DURATION;
  }

  /** Mete: susedne tuđe/neutralne; ako ih nema, bilo koja tuđa (upad iz vazduha). */
  private attackTargets(playerId: string): string[] {
    const own = [...this.state.board.values()].filter((st) => st.ownerId === playerId);
    const adjacent = new Set<string>();
    for (const st of own) {
      for (const n of this.territoryById.get(st.id)?.neighbors ?? []) {
        if (this.state.board.get(n)?.ownerId !== playerId) adjacent.add(n);
      }
    }
    if (adjacent.size > 0) return [...adjacent];
    return [...this.state.board.values()]
      .filter((st) => st.ownerId !== playerId)
      .map((st) => st.id);
  }

  /**
   * @param continuation nastavak opsade istog zamka. Tada nema kartice sa
   * najavom (ista poruka po treći put je šum) pa ni njenog vremena — ide se
   * pravo na odbrojavanje.
   */
  private beginDuel(
    room: Room,
    attackerId: string,
    territoryId: string,
    continuation = false
  ): void {
    const st = this.state.board.get(territoryId)!;
    const question = this.nextQuestion();
    if (!question) {
      this.nextAttack(room);
      return;
    }
    this.state.duel = {
      attackerId,
      defenderId: st.ownerId,
      territoryId,
      onCastle: st.castle,
      continuation,
    };
    this.setQuestion(question);
    this.state.pendingAttackerWin = null;
    this.state.pendingBroj = null;
    this.state.pendingOutcome = null;
    this.state.expected = new Set(
      [attackerId, st.ownerId].filter((id): id is string => !!id)
    );
    this.state.lastEvent = `${this.nameOf(room, attackerId)} napada ${this.territoryName(territoryId)}.`;
    this.state.phase = 'duel-pitanje';
    // Najava i odbrojavanje su jedna Objava (krug broji, naslov nosi strane
    // duela), pa faza traje samo pauzu za čitanje — najava više ne dodaje
    // svoje vreme povrh nje.
    this.state.phaseTimeRemaining =
      this.timings.PITANJE_NAJAVA_DURATION ?? PITANJE_NAJAVA_DURATION;
  }

  private finishDuelOdgovor(room: Room): void {
    const duel = this.state.duel;
    if (!duel) {
      this.nextAttack(room);
      return;
    }
    this.materializePartial();
    for (const id of this.state.expected) {
      const stats = this.statsFor(id);
      if (this.state.answers.get(id)?.correct) stats.tacnih += 1;
      else stats.netacnih += 1;
    }

    const attacker = this.sideOf(duel.attackerId);
    const defender = duel.defenderId ? this.sideOf(duel.defenderId) : null;
    const verdict = resolveScoredDuel(attacker, defender);

    if (verdict === 'tiebreak') {
      const question = this.nextBroj();
      if (question) {
        // Broj se pripremi, ali se NE postavlja odmah: prvo se otkriva izborno
        // pitanje, pa tek onda stiže klizač. Ranije je klizač banuo u istoj
        // sekundi u kojoj je nestalo pitanje, pa niko nije video šta je bilo
        // tačno ni zašto se uopšte igra i drugi krug.
        this.state.pendingBroj = question;
        this.state.pendingAttackerWin = null;
        this.state.lastEvent = 'Nerešeno — odlučiće broj.';
      } else {
        // Nema broj-pitanja u paketima — izjednačenje rešava brzina.
        const ar = attacker.remaining ?? -1;
        const dr = defender?.remaining ?? -1;
        this.state.lastEvent = 'Nerešeno — odlučuje brzina.';
        this.state.pendingAttackerWin = ar > dr;
      }
    } else {
      this.state.pendingAttackerWin = verdict === 'napadac';
    }

    // Ishod je izračunat, ali tabla se ne dira dok se ne odgleda tačan
    // odgovor. Ovde `lastEvent` NAMERNO ostaje bez posledice — inače bi
    // otkrivanje odalo ko je uzeo zemlju pre nego što se vidi zašto.
    this.state.phase = 'duel-odgovor-rezultat';
    this.state.phaseTimeRemaining =
      this.timings.DUEL_OTKRIVANJE_DURATION ?? DUEL_OTKRIVANJE_DURATION;
  }

  /** Drugi krug nerešenog duela — klizač, posle odgledanog izbornog pitanja. */
  private beginDuelBroj(): void {
    // Izborno pitanje je već otkriveno na svom ekranu, pa `answers` sme da se
    // prepiše procenama — ništa se ne gubi.
    this.state.brojQuestion = this.state.pendingBroj;
    this.state.pendingBroj = null;
    this.state.answers = new Map();
    this.state.phase = 'duel-broj';
    this.state.phaseTimeRemaining = ODGOVOR_DURATION;
  }

  private finishDuelBroj(room: Room): void {
    const duel = this.state.duel;
    const question = this.state.brojQuestion;
    if (!duel || !question) {
      this.nextAttack(room);
      return;
    }
    const attacker: DuelSide = {
      score: 0,
      qualifies: true,
      remaining: this.state.answers.get(duel.attackerId)?.remaining ?? null,
      distance: this.guessDistanceOrNull(duel.attackerId, question.answer),
    };
    const defender: DuelSide = {
      score: 0,
      qualifies: true,
      remaining: duel.defenderId
        ? (this.state.answers.get(duel.defenderId)?.remaining ?? null)
        : null,
      distance: duel.defenderId
        ? this.guessDistanceOrNull(duel.defenderId, question.answer)
        : null,
    };
    this.state.pendingAttackerWin = resolveBrojDuel(attacker, defender) === 'napadac';
    // Isto pravilo kao kod izbornog pitanja: prvo se vidi tačan broj, obe
    // procene i ko je bio brži, pa tek onda mapa i animacija.
    this.state.phase = 'duel-broj-rezultat';
    this.state.phaseTimeRemaining =
      this.timings.DUEL_OTKRIVANJE_DURATION ?? DUEL_OTKRIVANJE_DURATION;
  }

  /**
   * Ishod napada, u dva prolaza.
   *
   * `commit === false` samo izračuna šta se desilo i napiše poruke — tabla se
   * NE dira. To je `duel-ishod`: prozor preko ekrana u kome piše da Porodin
   * menja gospodara ili da je pao jedan zid, dok mapa još stoji netaknuta.
   *
   * `commit === true` upisuje posledicu i pušta `duel-rezultat`. Efekti se
   * izvode iz razlike dve uzastopne table, pa se time i oni odvezuju od
   * poruke: prvo se pročita ŠTA se desilo, pa se onda VIDI kako.
   *
   * Oba prolaza računaju isti `duelOutcome`, jer se između njih tabla ne menja.
   */
  private applyDuel(room: Room, attackerWon: boolean, commit: boolean): void {
    const duel = this.state.duel!;
    const st = this.state.board.get(duel.territoryId)!;
    const outcome = duelOutcome(attackerWon, duel.onCastle, st.walls);
    if (commit) duel.outcome = outcome;

    const attackerName = this.nameOf(room, duel.attackerId);
    const place = this.territoryName(duel.territoryId);

    switch (outcome) {
      case 'branilac':
        if (duel.defenderId) {
          // Ko nije odigrao, ne dobija poene — inače bi uspavan telefon
          // farmovao bonus za „odbranu" u kojoj nije učestvovao. Zemlju i
          // dalje zadržava; to je status quo, ne nagrada.
          const answered = this.state.answers.has(duel.defenderId);
          if (commit && answered) {
            this.addBonus(duel.defenderId, BITKA_ODBRANA_BONUS);
            this.statsFor(duel.defenderId).odbrana += 1;
          }
          this.state.lastEvent = `${this.nameOf(room, duel.defenderId)} brani ${place}.`;
          this.state.lastOutcome.set(
            duel.defenderId,
            answered ? `Odbranio si ${place}. +${BITKA_ODBRANA_BONUS}` : `${place} je ostao tvoj — ali nisi odgovorio.`
          );
          this.state.lastOutcome.set(duel.attackerId, `Napad na ${place} nije prošao.`);
        } else {
          this.state.lastEvent = `${place} ostaje ničiji.`;
          this.state.lastOutcome.set(duel.attackerId, `${place} ostaje ničiji.`);
        }
        break;

      case 'napadac':
        if (commit) {
          st.ownerId = duel.attackerId;
          this.statsFor(duel.attackerId).osvojeno += 1;
        }
        this.state.lastEvent = `${attackerName} osvaja ${place}.`;
        this.state.lastOutcome.set(duel.attackerId, `Osvojio si ${place}.`);
        if (duel.defenderId) {
          this.state.lastOutcome.set(duel.defenderId, `Izgubio si ${place}.`);
        }
        break;

      case 'zid': {
        // Poruka govori o stanju POSLE udarca, a u prvom prolazu zid još stoji
        // — zato se broj računa, a ne čita sa table.
        const left = Math.max(0, st.walls - 1);
        if (commit) {
          st.walls = left;
          this.addBonus(duel.attackerId, BITKA_ZID_BONUS);
          this.statsFor(duel.attackerId).zidova += 1;
        }
        this.state.lastEvent = `${attackerName} ruši zid zamka — ostalo ih je ${left}.`;
        this.state.lastOutcome.set(duel.attackerId, `Srušio si zid. +${BITKA_ZID_BONUS}`);
        if (duel.defenderId) {
          this.state.lastOutcome.set(duel.defenderId, `Zamak je izgubio zid — ostalo ih je ${left}.`);
        }
        break;
      }

      case 'zamak-pao': {
        const fallen = duel.defenderId!;
        if (commit) {
          st.walls = 0;
          for (const t of this.state.board.values()) {
            if (t.ownerId !== fallen) continue;
            t.ownerId = duel.attackerId;
            t.castle = false;
            t.walls = 0;
          }
          this.state.eliminated.add(fallen);
          this.addBonus(duel.attackerId, BITKA_ZID_BONUS);
          this.statsFor(duel.attackerId).zidova += 1;
          this.statsFor(duel.attackerId).osvojeno += 1;
        }
        this.state.lastEvent = `Zamak igrača ${this.nameOf(room, fallen)} je pao — sve preuzima ${attackerName}!`;
        this.state.lastOutcome.set(duel.attackerId, 'Osvojio si zamak i svu njegovu zemlju!');
        this.state.lastOutcome.set(fallen, 'Zamak ti je pao. Ispao si iz bitke.');
        break;
      }
    }

    if (!commit) {
      this.state.pendingAttackerWin = attackerWon;
      this.state.pendingOutcome = outcome;
      this.state.pendingWalls = outcome === 'zid' ? Math.max(0, st.walls - 1) : st.walls;
      this.state.phase = 'duel-ishod';
      this.state.phaseTimeRemaining =
        this.timings.DUEL_ISHOD_DURATION ?? DUEL_ISHOD_DURATION;
      return;
    }

    this.state.pendingOutcome = null;
    this.recomputeScores(room);
    this.state.phase = 'duel-rezultat';
    this.state.phaseTimeRemaining =
      this.timings.DUEL_REZULTAT_DURATION ?? DUEL_REZULTAT_DURATION;
  }

  /**
   * Sledeći napad — potez se UVEK rotira.
   *
   * Jedini izuzetak je opsada zamka i on se rešava u `duel-rezultat`: dok
   * napadač ruši zidove, ostaje na potezu i puca u isti zamak. Van toga niko
   * ne igra dva puta zaredom, da ostali ne bi gledali tuđu partiju.
   */
  private nextAttack(room: Room): void {
    this.state.duel = null;
    this.state.activePlayerId = null;

    const alive = this.aliveInOrder(room);
    if (alive.length <= 1) {
      this.finishGame(room);
      return;
    }

    this.state.attacksThisRound += 1;
    this.state.turnPointer = (this.state.turnPointer + 1) % Math.max(1, this.state.turnOrder.length);

    if (this.state.attacksThisRound >= alive.length) {
      this.state.round += 1;
      if (this.state.round > this.state.totalRounds) {
        this.finishGame(room);
        return;
      }
      this.beginAttackTurn(room, true);
      return;
    }
    this.beginAttackTurn(room);
  }

  private finishGame(room: Room): void {
    this.recomputeScores(room);
    const standing = room.players
      .filter((p) => !this.state.eliminated.has(p.id))
      .sort((a, b) => b.score - a.score);
    this.state.winnerId = standing[0]?.id ?? null;
    // Normalno se pobeđuje rušenjem svih tuđih zamkova; ako je udario
    // osigurač od zaglavljene partije, to treba i reći.
    this.state.lastEvent =
      standing.length <= 1
        ? `${this.nameOf(room, this.state.winnerId)} je ostao jedini sa zamkom!`
        : this.state.mode === 'runde'
          ? `Odigrano je ${this.state.totalRounds} rundi — pobeđuje najveći zbir poena.`
          : `Bitka se otegla — pobeđuje najveći zbir poena.`;
    this.state.activePlayerId = null;
    this.state.duel = null;
    // Pravo na kraj — bez sopstvenog ekrana „Bitka je gotova": odmah posle
    // ionako stiže platformski ekran sa poenima i diplomama, pa je zaseban
    // međuekran bio isti sadržaj dvaput.
    this.state.phase = 'ended';
    this.state.phaseTimeRemaining = 0;
  }

  // --- Diplome -------------------------------------------------------------

  getAwardCandidates(room: Room): DiplomaCandidate[] {
    const candidates: DiplomaCandidate[] = [];
    const entries = [...this.state.stats.entries()].filter(([id]) =>
      room.players.some((p) => p.id === id)
    );
    if (entries.length === 0) return candidates;

    const conqueror = entries.reduce((a, b) => (b[1].osvojeno > a[1].osvojeno ? b : a));
    if (conqueror[1].osvojeno >= 2) {
      candidates.push({
        playerId: conqueror[0],
        awardId: 'vojvoda',
        priority: 68,
        subtitle: `${conqueror[1].osvojeno} osvojenih teritorija`,
      });
    }

    const wall = entries.reduce((a, b) => (b[1].odbrana > a[1].odbrana ? b : a));
    if (wall[1].odbrana >= 2 && wall[0] !== conqueror[0]) {
      candidates.push({
        playerId: wall[0],
        awardId: 'zidar',
        priority: 60,
        subtitle: `${wall[1].odbrana} uspešnih odbrana`,
      });
    }

    for (const [id, stats] of entries) {
      if (stats.osvojeno === 0 && stats.odbrana === 0 && stats.zidova === 0) {
        candidates.push({
          playerId: id,
          awardId: 'gost-u-svojoj-zemlji',
          priority: 54,
          subtitle: 'Ni osvojio, ni odbranio',
        });
      }
    }

    return candidates;
  }

  // --- Pitanja -------------------------------------------------------------

  /**
   * Izborna pitanja iz izabranih kviz pakova, banka kao rezerva. Broj-pitanja
   * su poseban bazen (tiebreak): ako ih u izabranim pakovima nema, dovlači se
   * `pogodi-broj`; ako ni to ne uspe, izjednačenje rešava brzina.
   */
  /**
   * Filter tipova sa ekrana za izbor igre (isti selektor kao Kviz).
   *
   * Bez ovoga je čekiranje tipova bilo dugme koje ništa ne radi: TV nudi
   * filter, `host:start-game` ga nosi, a modul ga je ignorisao — pa se novi tip
   * nije mogao ni tražiti, nego samo čekati da se sam pojavi među 3% pitanja.
   *
   * `null` = bez filtriranja. Tipovi koje igra ne ume da postavi se odbacuju
   * ovde, pa „geo + matrica" znači isto što i „matrica".
   */
  private parseTypeFilter(raw: unknown): KvizQuestionType[] | null {
    if (!Array.isArray(raw)) return null;
    const types = raw.filter((v): v is KvizQuestionType =>
      (BITKA_QUIZ_TYPES as string[]).includes(v as string)
    );
    if (types.length === 0 || types.length === BITKA_QUIZ_TYPES.length) return null;
    return types;
  }

  private async loadPools(
    packIds: string[],
    types: KvizQuestionType[] | null
  ): Promise<void> {
    const pitanja: BitkaQuestionFull[] = [];
    const broj: KvizBrojQuestionFull[] = [];
    this.packNames.clear();

    const resolved = await Promise.all(
      packIds.map((id) =>
        id === KVIZ_BANK_PACK_ID || !this.packsDir
          ? Promise.resolve(null)
          : resolveQuizPack(this.packsDir, id)
      )
    );
    for (let i = 0; i < packIds.length; i++) {
      const pack = packIds[i] === KVIZ_BANK_PACK_ID ? null : resolved[i];
      const questions = pack ? pack.questions : packIds[i] === KVIZ_BANK_PACK_ID ? QUIZ_QUESTION_BANK : [];
      if (pack) {
        for (const q of questions) this.packNames.set(q.id, pack.name);
        this.feedback.registerPack(pack.id, pack.questions);
      } else if (packIds[i] === KVIZ_BANK_PACK_ID) {
        this.feedback.registerBank(QUIZ_QUESTION_BANK);
      }
      pitanja.push(...questions.filter(isBitkaQuestion));
      broj.push(...questions.filter(isBrojQuestion));
    }

    // Novi tipovi NEMAJU rezervu: ako izabrani pakovi nose samo izborna
    // pitanja, igra je izborna. Namerno — ti tipovi žive u namenskim pakovima
    // (`matrica.json` je sav matrica), pa bi dovlačenje rezerve pretvorilo
    // izbor „hoću istoriju" u partiju mreža koju niko nije tražio.
    // Filter tipova dira SAMO pitanja, ne i broj-pak: razrešenje nerešenog
    // duela i uvodno merenje su mašinerija, a ne izbor sadržaja — ko čekira
    // „samo matrica" ne traži partiju bez razrešenja.
    if (types) {
      const filtered = pitanja.filter((q) => types.includes(q.type));
      // Prazan rezultat vraća nefiltrirani pak, isto kao u Kvizu: bolje pitanje
      // pogrešnog tipa nego partija bez ijednog pitanja.
      if (filtered.length > 0) {
        pitanja.length = 0;
        pitanja.push(...filtered);
      }
    }

    if (pitanja.length === 0) pitanja.push(...QUIZ_QUESTION_BANK.filter(isBitkaQuestion));
    // Ugrađena banka nema broj-pitanja, pa je jedina rezerva poseban pak.
    if (broj.length === 0 && this.packsDir) {
      const fallback = await resolveQuizPack(this.packsDir, BROJ_FALLBACK_PACK);
      if (fallback) this.feedback.registerPack(fallback.id, fallback.questions);
      broj.push(...(fallback?.questions ?? []).filter(isBrojQuestion));
    }

    this.state.questionPool = shuffled(pitanja);
    this.state.brojPool = shuffled(broj);
    this.state.questionCursor = 0;
    this.state.brojCursor = 0;
    this.state.loading = false;
  }

  /**
   * Postavi pitanje i pripremi sve što uz njega ide.
   *
   * Mešanje mora ovde, a ne u `buildGameState`: prikazani redosled i izmešana
   * slova moraju da budu isti za svakog igrača i kroz svako ponovno slanje
   * stanja (a ono ide na svaki tik), inače bi se lista premeštala pod prstom.
   */
  private setQuestion(question: BitkaQuestionFull | null): void {
    this.state.question = question;
    this.state.brojQuestion = null;
    this.state.answers = new Map();
    this.state.dominoProgress = new Map();
    this.state.wrongText = new Map();
    this.state.shuffledItems = [];
    this.state.scramble = '';
    if (!question) return;

    if (isRedosledQuestion(question)) {
      // `shuffledItems[k]` = originalni indeks pojma prikazanog na k-tom mestu.
      this.state.shuffledItems = shuffled(question.items.map((_, i) => i));
    } else if (question.type === 'anagram') {
      this.state.scramble = scrambleOf(question.answer);
    }
  }

  private nextQuestion(): BitkaQuestionFull | null {
    const pool = this.state.questionPool;
    if (pool.length === 0) return null;
    if (this.state.questionCursor >= pool.length) {
      this.state.questionPool = shuffled(pool);
      this.state.questionCursor = 0;
    }
    return this.state.questionPool[this.state.questionCursor++];
  }

  private nextBroj(): KvizBrojQuestionFull | null {
    const pool = this.state.brojPool;
    if (pool.length === 0) return null;
    if (this.state.brojCursor >= pool.length) {
      this.state.brojPool = shuffled(pool);
      this.state.brojCursor = 0;
    }
    return this.state.brojPool[this.state.brojCursor++];
  }

  // --- Sitni pomoćnici -----------------------------------------------------

  private pickMap(customContent?: unknown, players = 0): BitkaMapView | null {
    const cc = (customContent ?? {}) as BitkaStartOptions;
    const requested = typeof cc.bitkaMapId === 'string' ? cc.bitkaMapId : '';
    if (requested) {
      const map = resolveBitkaMapSync(this.mapsDir, requested);
      if (map) return map;
    }
    // Bez izbora (ili sa pokvarenim izborom) uzmi prvu ispravnu mapu, da igra
    // ne bude nepokretna zbog propuštenog polja u payloadu — ali onu koja nosi
    // celo društvo, ako takva postoji.
    const fallbackId = firstValidBitkaMapIdSync(
      this.mapsDir,
      players > 0 ? bitkaMinTeritorija(players) : 0
    );
    return fallbackId ? resolveBitkaMapSync(this.mapsDir, fallbackId) : null;
  }

  private alivePlayerIds(room: Room): string[] {
    return room.players
      .filter((p) => p.isConnected && !this.state.eliminated.has(p.id))
      .map((p) => p.id);
  }

  /** Živi igrači, u redosledu poteza. */
  private aliveInOrder(room: Room): string[] {
    return this.state.turnOrder.filter(
      (id) => !this.state.eliminated.has(id) && room.players.some((p) => p.id === id)
    );
  }

  private allAnswered(room: Room): boolean {
    let waiting = 0;
    for (const id of this.state.expected) {
      // Igrač u grejsu ostaje u snapshotu — uspavan telefon ne sme da smanji
      // imenilac; tek `onPlayerDisconnect` ga zaista skida.
      if (!room.players.some((p) => p.id === id)) continue;
      if (!this.state.answers.has(id)) return false;
      waiting += 1;
    }
    return waiting > 0;
  }

  private sideOf(playerId: string): DuelSide {
    const answer = this.state.answers.get(playerId);
    return {
      score: answer?.score ?? 0,
      qualifies: !!answer?.correct,
      remaining: answer?.remaining ?? null,
    };
  }

  private guessDistance(playerId: string, answer: number): number {
    const value = this.state.answers.get(playerId)?.value;
    return typeof value === 'number' ? Math.abs(value - answer) : Number.POSITIVE_INFINITY;
  }

  private guessDistanceOrNull(playerId: string, answer: number): number | null {
    const value = this.state.answers.get(playerId)?.value;
    return typeof value === 'number' ? Math.abs(value - answer) : null;
  }

  private priorityOf(playerId: string): number {
    const at = this.state.priority.indexOf(playerId);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  }

  private freeTerritoryIds(): string[] {
    return [...this.state.board.values()]
      .filter((st) => st.ownerId === null)
      .map((st) => st.id);
  }

  private territoryName(id: string): string {
    return this.territoryById.get(id)?.name ?? id;
  }

  private nameOf(room: Room, playerId: string | null): string {
    if (!playerId) return 'Igrač';
    return room.players.find((p) => p.id === playerId)?.name ?? 'Igrač';
  }

  private statsFor(playerId: string): BitkaStats {
    let s = this.state.stats.get(playerId);
    if (!s) {
      s = emptyStats();
      this.state.stats.set(playerId, s);
    }
    return s;
  }

  private addBonus(playerId: string, points: number): void {
    this.state.bonus.set(playerId, (this.state.bonus.get(playerId) ?? 0) + points);
  }

  /** Rezultat je uvek zbir zemlje i bonusa — tabla i leaderboard ne mogu da se raziđu. */
  private recomputeScores(room: Room): void {
    for (const player of room.players) {
      let score = this.state.bonus.get(player.id) ?? 0;
      for (const st of this.state.board.values()) {
        if (st.ownerId !== player.id) continue;
        score += st.castle
          ? BITKA_ZAMAK_BODOVI
          : territoryValue(this.territoryById.get(st.id) ?? {});
      }
      player.score = score;
    }
  }

  // --- Slanje stanja -------------------------------------------------------

  /** Broj-pitanje bez tačne vrednosti — ta ide zasebno, tek u otkrivanju. */
  private brojView(q: KvizBrojQuestionFull): BitkaQuestionView {
    return {
      kind: 'broj',
      id: q.id,
      text: q.text,
      imageUrl: q.imageUrl,
      min: q.min,
      max: q.max,
      step: q.step,
      unit: q.unit,
    };
  }

  /**
   * Pogled na pitanje + kategorija (ime paka). Broj-pitanje je ostavljeno bez
   * nje namerno: uvodno merenje i razrešenje nerešenog duela su mašinerija, a
   * ne izbor sadržaja — pak im bira server (rezerva `pogodi-broj`), pa bi
   * natpis govorio o nečemu što igrač nije birao.
   */
  private questionView(): BitkaQuestionView | undefined {
    const view = this.buildQuestionView();
    if (!view || view.kind === 'broj') return view;
    const pack = this.state.question ? this.packNames.get(this.state.question.id) : undefined;
    return pack ? { ...view, packName: pack } : view;
  }

  private buildQuestionView(): BitkaQuestionView | undefined {
    const phase = this.state.phase;
    // `redosled-rezultat` je otkrivanje uvodnog broj-pitanja i mora da ostane
    // NA njemu — inače se tačan broj nigde ne vidi, a po njemu se određuje ko
    // prvi bira zamak.
    if (
      phase === 'redosled-pitanje' ||
      phase === 'redosled-odgovor' ||
      phase === 'redosled-rezultat' ||
      phase === 'duel-broj' ||
      phase === 'duel-broj-rezultat'
    ) {
      const q = this.state.brojQuestion;
      if (!q) return undefined;
      return this.brojView(q);
    }
    const q = this.state.question;
    if (!q) return undefined;
    if (isMatricaQuestion(q)) {
      // Devet pojmova je samo pitanje — bez njih se nema šta rešavati. Tačna
      // trojka (`q.correct`) i objašnjenje ostaju ovde do otkrivanja.
      return {
        kind: 'matrica',
        id: q.id,
        text: q.text,
        cells: q.cells,
        pick: q.correct.length,
      };
    }
    if (isRedosledQuestion(q)) {
      // Pojmovi idu IZMEŠANI (`shuffledItems`), isti za sve; original je
      // ujedno i tačan poredak, pa ne sme napolje.
      return {
        kind: 'redosled',
        id: q.id,
        text: q.text,
        items: this.state.shuffledItems.map((i) => q.items[i]),
      };
    }
    if (isDominoQuestion(q)) {
      // Sam niz NE ide u broadcast — igrač ga hoda korak po korak kroz
      // `playerData`. Ovde stoje samo natpisi na dugmadima i dužina niza.
      return {
        kind: 'domino',
        id: q.id,
        text: q.text,
        lowerLabel: q.lowerLabel,
        higherLabel: q.higherLabel,
        unit: q.unit,
        valueType: q.valueType,
        steps: Math.max(1, q.items.length - 1),
      };
    }
    if (isTextQuestion(q)) {
      return {
        kind: 'tekst',
        id: q.id,
        text: q.text,
        textKind: q.type,
        emojis: q.type === 'emoji' ? q.emojis : undefined,
        category: q.type === 'emoji' ? q.category : undefined,
        quote: q.type === 'dopuna' ? q.quote : undefined,
        scramble: q.type === 'anagram' ? this.state.scramble : undefined,
      };
    }
    return {
      kind: 'izbor',
      id: q.id,
      text: q.text,
      imageUrl: q.imageUrl,
      options: q.options,
    };
  }

  private answerResults(): BitkaAnswerResult[] {
    return [...this.state.expected].map((playerId) => {
      const answer = this.state.answers.get(playerId);
      return {
        playerId,
        optionIndex: answer?.optionIndex ?? null,
        value: answer?.value ?? null,
        cells: answer?.cells ?? null,
        order: answer?.order ?? null,
        streak: answer?.streak ?? null,
        text: answer?.text ?? null,
        score: answer?.score ?? 0,
        correct: !!answer?.correct,
        seconds: answer ? Math.round((ODGOVOR_DURATION - answer.remaining) * 10) / 10 : null,
      };
    });
  }

  private buildGameState(room: Room): GameState {
    const phase = this.state.phase;
    /**
     * `*-pitanje` NAMERNO nije ovde: to je odbrojavanje, i pitanje se u njemu
     * ne šalje nikom. Dok je stajalo iznad mape, isti tekst se čitao dvaput —
     * jednom u traci, pa opet preko celog ekrana — a odbrojavanje kaže samo
     * kad da se digne pogled.
     */
    const showQuestion =
      phase === 'redosled-odgovor' ||
      phase === 'redosled-rezultat' ||
      phase === 'osvajanje-odgovor' ||
      phase === 'osvajanje-rezultat' ||
      phase === 'duel-odgovor' ||
      phase === 'duel-odgovor-rezultat' ||
      phase === 'duel-broj' ||
      phase === 'duel-broj-rezultat';
    /**
     * `duel-rezultat` NIJE otkrivanje: pitanje je već odgledano na svom
     * ekranu, a ovaj je mapa i animacija preuzimanja. Dok je pitanje stajalo i
     * ovde, isti odgovor se čitao po treći put, preko onoga što treba gledati.
     */
    const revealing =
      phase === 'redosled-rezultat' ||
      phase === 'osvajanje-rezultat' ||
      phase === 'duel-odgovor-rezultat' ||
      phase === 'duel-broj-rezultat';

    const hostData: BitkaHostData = {
      phase,
      mode: this.state.mode,
      map: this.state.map,
      board: [...this.state.board.values()],
      players: this.playerViews(room),
      round: this.state.round,
      totalRounds: this.state.totalRounds,
    };

    if (this.state.osvajanjeRound > 0 && phase.startsWith('osvajanje')) {
      hostData.osvajanjeRound = this.state.osvajanjeRound;
    }
    if (this.state.lastEvent) hostData.lastEvent = this.state.lastEvent;

    if (showQuestion) {
      hostData.question = this.questionView();
      hostData.expectedIds = [...this.state.expected];
      // Samo KO je odgovorio; ŠTA je odgovorio ostaje u playerData.
      hostData.answeredIds = [...this.state.answers.keys()];
      const q = this.state.question;
      if (q && isDominoQuestion(q)) {
        hostData.dominoProgress = [...this.state.expected].map((id) => {
          const prog = this.dominoProgressOf(id);
          return { playerId: id, streak: prog.streak, done: prog.done };
        });
      }
    }

    if (revealing) {
      // Otkriva se tačno ono pitanje koje je na ekranu (`questionView`) — u
      // `duel-broj-rezultat` to je broj, pa izborni odgovor tu nema šta da
      // traži, a u `redosled-rezultat` obrnuto.
      const brojNaEkranu = phase === 'redosled-rezultat' || phase === 'duel-broj-rezultat';
      const q = this.state.question;
      if (q && !brojNaEkranu) {
        if (isMatricaQuestion(q)) {
          hostData.correctCells = q.correct;
          if (q.explanation) hostData.explanation = q.explanation;
        } else if (isRedosledQuestion(q)) {
          // Tačan poredak izražen u indeksima PRIKAZANE liste, pa ekran ne
          // mora da zna kako je mešano.
          const at = new Map(this.state.shuffledItems.map((orig, shown) => [orig, shown]));
          hostData.correctOrder = q.items.map((_, orig) => at.get(orig) ?? 0);
        } else if (isDominoQuestion(q)) {
          hostData.dominoChain = q.items.map((it) => ({ label: it.label, value: it.value }));
        } else if (isTextQuestion(q)) {
          hostData.correctText = q.answer;
        } else {
          hostData.correctIndex = q.correctIndex;
        }
      }
      if (this.state.brojQuestion && brojNaEkranu) {
        hostData.correctValue = this.state.brojQuestion.answer;
      }
      hostData.results = this.answerResults();
    }

    if (phase === 'baza-izbor') {
      hostData.activePlayerId = this.state.activePlayerId;
      hostData.selectableIds = this.baseEligibleIds();
      // Podignut zamak se ionako vidi na tabli, pa ovo više nije tajna nego
      // prosto spisak onih koji su svoje odradili.
      hostData.baseCommittedIds = [...this.state.baseChoice.keys()];
      hostData.pickQueue = [...this.state.baseQueue];
    }
    if (phase === 'osvajanje-izbor') {
      hostData.activePlayerId = this.state.activePlayerId;
      hostData.pickQueue = [...this.state.pickQueue];
      hostData.selectableIds = this.state.activePlayerId
        ? this.freePickTargets(this.state.activePlayerId)
        : [];
    }
    if (phase === 'napad-izbor') {
      hostData.activePlayerId = this.state.activePlayerId;
      hostData.selectableIds = this.state.activePlayerId
        ? this.attackTargets(this.state.activePlayerId)
        : [];
    }

    if (this.state.duel) {
      const duel: BitkaDuelView = {
        attackerId: this.state.duel.attackerId,
        defenderId: this.state.duel.defenderId,
        territoryId: this.state.duel.territoryId,
        onCastle: this.state.duel.onCastle,
        attackerCommitted: this.state.answers.has(this.state.duel.attackerId),
        defenderCommitted: !!this.state.duel.defenderId && this.state.answers.has(this.state.duel.defenderId),
      };
      if (phase === 'duel-odgovor-rezultat' && this.state.pendingBroj) {
        duel.tiebreakPending = true;
      }
      if (this.state.duel.continuation) duel.opsadaNastavak = true;
      if (phase === 'duel-ishod' && this.state.pendingOutcome) {
        duel.pendingOutcome = this.state.pendingOutcome;
        duel.wallsAfter = this.state.pendingWalls;
      }
      if (phase === 'duel-rezultat') duel.outcome = this.state.duel.outcome;
      hostData.duel = duel;
    }

    if (phase === 'ended') {
      hostData.leaderboard = this.playerViews(room)
        .map((p) => ({
          playerId: p.playerId,
          name: p.name,
          avatarColor: p.avatarColor,
          avatarEmoji: p.avatarEmoji,
          score: p.score,
          territories: p.territories,
          rank: 0,
        }))
        .sort((a, b) => b.score - a.score)
        .map((entry, i) => ({ ...entry, rank: i + 1 }));
      hostData.winnerId = this.state.winnerId;
    }

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      playerData[player.id] = this.controllerData(
        player.id,
        player.score
      ) as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase,
      round: Math.max(1, this.state.round),
      totalRounds: this.state.totalRounds,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data: { phase, host: hostData } as unknown as Record<string, unknown>,
      playerData,
    };
  }

  private playerViews(room: Room): BitkaPlayerView[] {
    return room.players.map((p) => {
      const owned = [...this.state.board.values()].filter((st) => st.ownerId === p.id);
      const castle = owned.find((st) => st.castle);
      return {
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        avatarEmoji: p.avatarEmoji,
        score: p.score,
        territories: owned.length,
        walls: castle?.walls ?? 0,
        eliminated: this.state.eliminated.has(p.id),
        priority: this.priorityOf(p.id) + 1,
      };
    });
  }

  private controllerData(playerId: string, score: number): BitkaControllerData {
    const phase = this.state.phase;
    const answer = this.state.answers.get(playerId);
    const duel = this.state.duel;

    const data: BitkaControllerData = {
      isActive: this.state.activePlayerId === playerId,
      hasAnswered: this.state.answers.has(playerId),
      eliminated: this.state.eliminated.has(playerId),
      score,
      myTerritoryIds: [...this.state.board.values()]
        .filter((st) => st.ownerId === playerId)
        .map((st) => st.id),
    };

    if (answer) {
      data.selectedIndex = answer.optionIndex ?? null;
      data.myGuess = answer.value ?? null;
      data.selectedCells = answer.cells ?? null;
      data.selectedOrder = answer.order ?? null;
      data.myText = answer.text ?? null;
    }
    const wrong = this.state.wrongText.get(playerId);
    if (wrong) data.lastWrongText = wrong;

    // Domino: referenca sa vrednošću i SLEDEĆI pojam bez nje. Cela lista bi
    // odala sve odgovore odjednom, pa ovde ide tačno jedan korak.
    const q = this.state.question;
    if (q && isDominoQuestion(q) && this.state.expected.has(playerId)) {
      const prog = this.dominoProgressOf(playerId);
      const prev = q.items[prog.pos - 1];
      const cur = q.items[prog.pos];
      data.domino = {
        reference: prev ? { label: prev.label, value: prev.value } : null,
        current: prog.done || !cur ? null : cur.label,
        streak: prog.streak,
        done: prog.done,
        steps: Math.max(1, q.items.length - 1),
      };
    }

    if (duel) {
      data.duelRole =
        duel.attackerId === playerId
          ? 'napadac'
          : duel.defenderId === playerId
            ? 'branilac'
            : 'posmatrac';
    }

    if (phase === 'baza-izbor') {
      // Bira samo onaj ko je na potezu; ostali gledaju mapu i vide gde su
      // zamkovi već podignuti.
      data.isActive = this.state.activePlayerId === playerId;
      if (data.isActive) data.selectableIds = this.baseEligibleIds();
      data.myBaseChoice = this.state.baseChoice.get(playerId) ?? null;
    } else if (phase === 'osvajanje-izbor' && this.state.activePlayerId === playerId) {
      data.selectableIds = this.freePickTargets(playerId);
    } else if (phase === 'napad-izbor' && this.state.activePlayerId === playerId) {
      data.selectableIds = this.attackTargets(playerId);
    }

    const outcome = this.state.lastOutcome.get(playerId);
    if (outcome) data.lastOutcome = outcome;

    return data;
  }
}
