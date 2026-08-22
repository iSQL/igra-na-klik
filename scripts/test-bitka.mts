/**
 * Headless prolaz kroz partiju igre Osvajanje.
 *
 *   npx tsx scripts/test-bitka.ts [--map <id>] [--rounds <n>] [--players <2-4>]
 *
 * Diže server u procesu (bez Vite-a i bez UI-ja), spaja jednog domaćina i 2–4
 * igrača preko `socket.io-client` i igra celu partiju: uvodno merenje →
 * zamkovi → osvajanje → rat → kraj. Isti recept je na Penalima bio najbrži
 * način da se nova igra proveri, jer hvata stvari koje klikanje po UI-ju
 * propušta.
 *
 * Uz to radi i **anti-leak skener**: svaki `game:state-update` (broadcast koji
 * vide svi telefoni) se pretražuje na tačne odgovore i na tuđe izbore u fazama
 * u kojima ne smeju da postoje. Jedan hit = pad testa.
 */

import { createServer } from 'http';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { io, type Socket } from 'socket.io-client';
import { setupSocket } from '../packages/server/src/socket/setup.js';
import { initTimingConfig } from '../packages/server/src/game/timing-config.js';
import {
  getQuizFeedback,
  initQuizFeedback,
} from '../packages/server/src/game/quiz-feedback.js';
import {
  duelOutcome,
  resolveBrojDuel,
  resolveScoredDuel,
} from '../packages/server/src/game/games/bitka/duel.js';
import { BITKA_MAX_IGRACA, BITKA_MIN_IGRACA } from '../packages/shared/src/games/bitka-rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

const MAP_ID = arg('map');
/** Koliko igrača sedne za sto (2–4; četvoro traži mapu sa bar 12 teritorija). */
const PLAYERS = Math.max(
  BITKA_MIN_IGRACA,
  Math.min(BITKA_MAX_IGRACA, Number(arg('players') ?? 3))
);
/** Trajanje: bez `--rounds` ide do poslednjeg zamka, inače toliko rundi. */
const ROUNDS = Number(arg('rounds') ?? 0);
const MODE = ROUNDS > 0 ? 'runde' : 'zamkovi';
/**
 * Kviz paketi iz kojih se vuku pitanja. Bez `--pack` igra NE čita ništa sa
 * diska nego uzme ugrađenu banku — što je i razlog zašto se novi tipovi tu ne
 * vide. `--pack all` šalje sve pakete, isto što TV šalje kad igrač ne dira
 * izbor; `--pack matrica` šalje jedan.
 */
const PACK_ARG = arg('pack') ?? '';
const PACK_IDS =
  PACK_ARG === 'all'
    ? readdirSync(path.join(REPO_ROOT, 'question-packs'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
    : PACK_ARG.split(',')
        .map((v) => v.trim())
        .filter(Boolean);
/**
 * Filter tipova sa ekrana za izbor igre (`--types matrica`). Isti put kojim
 * ide i TV: `host:start-game` nosi `quizTypes`, modul ih presecа sa onim što
 * ume da postavi. Bez ovoga se nov tip pojavljuje samo srazmerno svom udelu u
 * paketima — matrica je ~3%, pa u partiji od dvadesetak pitanja obično nijednom.
 */
const TYPES = (arg('types') ?? '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

/**
 * Odgovori na tekstualna pitanja iz izabranih paketa.
 *
 * Server namerno NE šalje odgovor, pa bot nema odakle da ga zna — a bez njega
 * se uspešna grana `handleText` nikad ne prođe: sve što bi test video je
 * promašaj i istek vremena. Harness zato čita pakete sa diska i traži pitanje
 * po onome što JESTE javno: emoji nizu, početku citata, odnosno slovima
 * anagrama (izmešana su, pa se poklapaju kad se sortiraju).
 */
const textAnswers: { kind: string; key: string; answer: string }[] = [];

function letterKey(v: string): string {
  return [...v.toUpperCase().replace(/[^A-ZŠĐČĆŽ]/g, '')].sort().join('');
}

function loadTextAnswers(): void {
  for (const id of PACK_IDS) {
    let raw: unknown;
    try {
      raw = JSON.parse(
        readFileSync(path.join(REPO_ROOT, 'question-packs', `${id}.json`), 'utf8')
      );
    } catch {
      continue;
    }
    const list = Array.isArray(raw)
      ? raw
      : ((raw as { questions?: unknown[] }).questions ?? []);
    for (const q of list) {
      if (!q || typeof q !== 'object') continue;
      const it = q as Record<string, unknown>;
      const answer = typeof it.answer === 'string' ? it.answer : '';
      if (!answer) continue;
      if (it.type === 'emoji' && typeof it.emojis === 'string') {
        textAnswers.push({ kind: 'emoji', key: it.emojis, answer });
      } else if (it.type === 'dopuna' && typeof it.quote === 'string') {
        textAnswers.push({ kind: 'dopuna', key: it.quote, answer });
      } else if (it.type === 'anagram') {
        textAnswers.push({ kind: 'anagram', key: letterKey(answer), answer });
      }
    }
  }
}

function textAnswerFor(q: {
  textKind?: string;
  emojis?: string;
  quote?: string;
  scramble?: string;
}): string | null {
  const key =
    q.textKind === 'emoji'
      ? q.emojis
      : q.textKind === 'dopuna'
        ? q.quote
        : q.scramble
          ? letterKey(q.scramble)
          : undefined;
  if (!key) return null;
  return textAnswers.find((t) => t.kind === q.textKind && t.key === key)?.answer ?? null;
}

// --- anti-leak ---------------------------------------------------------------

/** Polja koja u broadcastu smeju da postoje samo u fazama otkrivanja. */
const REVEAL_ONLY = [
  'correctIndex',
  'correctValue',
  'correctCells',
  'correctOrder',
  'correctText',
  // Ceo domino niz sa vrednostima; dok se igra, igrač vidi samo svoj korak.
  'dominoChain',
  'explanation',
  'tiebreak',
];
/**
 * Polja koja u broadcastu ne smeju da postoje NIKAD.
 *
 * `selectedCells` je matričin parnjak `selectedIndex`-a: devet pojmova mreže
 * jesu javni (bez njih nema pitanja), ali koje je tri neko tapnuo ostaje u
 * njegovom `playerData` do otkrivanja.
 */
const NEVER = [
  'answer',
  'options.correct',
  'selectedIndex',
  'selectedCells',
  'selectedOrder',
  'myGuess',
  'myText',
  'lastWrongText',
  'baseChoice',
];
/**
 * Isto „nikad", ali provereno kao KLJUČ (`"x":`) a ne kao reč.
 *
 * `domino` mora ovako: kao gola reč se poklapa sa vrednošću `"kind":"domino"`,
 * pa bi svako domino pitanje ispalo curenje. Ključ `"domino":` je privatni
 * korak igrača (referenca + sledeći pojam) i njega u broadcastu ne sme biti.
 */
const NEVER_KEYS = ['domino'];
const REVEAL_PHASES = new Set([
  'redosled-rezultat',
  'osvajanje-rezultat',
  // Duel otkriva u dva koraka pre nego što posledica sleti na mapu: izborno
  // pitanje, pa broj koji razrešava nerešeno.
  'duel-odgovor-rezultat',
  'duel-broj-rezultat',
  // `duel-rezultat` NAMERNO nije otkrivanje: pitanje je odgledano na svom
  // ekranu, a ovaj je mapa i animacija — tačan odgovor tu više ne sme.
  'ended',
]);
/**
 * Faze koje su čisto odbrojavanje: pitanje se u njima NE šalje nikom. Dok je
 * stajalo iznad mape, isti tekst se čitao dvaput — jednom u traci, pa opet
 * preko celog ekrana.
 */
const COUNTDOWN_PHASES = new Set(['redosled-pitanje', 'osvajanje-pitanje', 'duel-pitanje']);

const leaks: string[] = [];

function scanBroadcast(phase: string, payload: unknown): void {
  const json = JSON.stringify(payload);
  for (const key of NEVER) {
    if (json.includes(`"${key}"`)) leaks.push(`[${phase}] broadcast sadrži "${key}"`);
  }
  for (const key of NEVER_KEYS) {
    if (json.includes(`"${key}":`)) leaks.push(`[${phase}] broadcast sadrži ključ "${key}"`);
  }
  if (COUNTDOWN_PHASES.has(phase) && json.includes('"question"')) {
    leaks.push(`[${phase}] odbrojavanje već nosi pitanje`);
  }
  if (REVEAL_PHASES.has(phase)) return;
  for (const key of REVEAL_ONLY) {
    if (json.includes(`"${key}"`)) leaks.push(`[${phase}] broadcast sadrži "${key}" van faze otkrivanja`);
  }
  // Izbor baze: samo "ko je potvrdio", nikad i koju teritoriju.
  if (phase === 'baza-izbor' && json.includes('"myBaseChoice"')) {
    leaks.push('[baza-izbor] broadcast otkriva tuđi izbor baze');
  }
}

// --- pravila duela (čista funkcija, bez servera) ------------------------------

const ruleFailures: string[] = [];
/** Ko je zamak stvarno izabrao (a ne dobio istekom vremena) i gde. */
const basePicked = new Map<number, string>();
/** Tabla čim se zamkovi postave — pre nego što rat počne da menja vlasnike. */
let baseBoard: { id: string; ownerId: string | null; castle: boolean }[] | null = null;
/** Koliko puta je srušen zid, i koliko je puta posle toga opsada nastavljena. */
let wallHits = 0;
let siegeContinued = 0;

/**
 * Opsada mora da zadrži potez: posle srušenog zida isti napadač odmah dobija
 * novo pitanje na istom zamku. Prati se par (napadač, meta) kroz `duel-rezultat`
 * pa sledeći `duel-*` — ako se poklapa, opsada je nastavljena.
 */
let pendingSiege: { attackerId: string; territoryId: string } | null = null;
let lastDuelKey = '';

/**
 * Svaki tip pitanja mora da stigne i u trku za zemlju i u duel, i mora da se
 * otkrije NA SVOM ekranu — sa tačnim odgovorom i sa rezultatom po igraču.
 *
 * Prati se po tipu jer je otkrivanje za svaki drugo polje: `correctIndex` za
 * izbor, `correctCells` za matricu, `correctOrder` za redosled, `dominoChain`
 * za domino, `correctText` za slobodan tekst. Bez ovoga tip može da radi u
 * fazi odgovaranja a da se na otkrivanju ne vidi ništa — pa igrač nikad ne
 * sazna zašto je izgubio zemlju.
 */
const sawKind = new Map<string, number>();
const sawKindReveal = new Map<string, number>();
/** Isti tip mora da stigne i u trku i u duel — brojano odvojeno. */
const sawByPhase = new Map<string, number>();
let pendingKind: string | null = null;

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Polje otkrivanja koje taj tip MORA da nosi. */
function revealFieldOf(kind: string): string | null {
  if (kind === 'izbor') return 'correctIndex';
  if (kind === 'matrica') return 'correctCells';
  if (kind === 'redosled') return 'correctOrder';
  if (kind === 'domino') return 'dominoChain';
  if (kind === 'tekst') return 'correctText';
  return null;
}

/**
 * Prijava pitanja iz popupa igrača.
 *
 * Prati se poseban slučaj zbog koga i postoji: prijava **prethodnog** pitanja.
 * Igrač se sporne stvari seti tek kad vidi tačan odgovor, a dotle je ekran
 * otišao dalje — pa se ovde namerno prijavljuje id koji VIŠE NIJE na ekranu i
 * proverava da je server to ipak zapisao.
 */
const seenQuestionIds: string[] = [];
let reportedPrevious: string | null = null;
let missingQuestionIds = 0;

function trackFeedback(state: GameStateLite, report: (questionId: string) => void): void {
  const host = state.data.host as Record<string, unknown>;
  const q = host.question as { id?: string } | undefined;
  if (!q) return;
  if (!q.id) {
    // Bez id-ja telefon nema šta da prijavi — pitanje bi bilo neprijavljivo.
    missingQuestionIds += 1;
    return;
  }
  if (seenQuestionIds[seenQuestionIds.length - 1] === q.id) return;
  seenQuestionIds.push(q.id);

  // Čim postoji nešto ranije, prijavi baš to — ne tekuće.
  if (!reportedPrevious && seenQuestionIds.length >= 2) {
    const previous = seenQuestionIds[seenQuestionIds.length - 2];
    reportedPrevious = previous;
    report(previous);
  }
}

function trackQuestionKinds(state: GameStateLite): void {
  const host = state.data.host as Record<string, unknown>;
  const q = host.question as
    | { kind?: string; cells?: unknown[]; pick?: number; items?: unknown[]; steps?: number }
    | undefined;

  if (state.phase === 'osvajanje-odgovor' || state.phase === 'duel-odgovor') {
    if (q?.kind && !pendingKind) {
      pendingKind = q.kind;
      bump(sawKind, q.kind);
      bump(sawByPhase, `${q.kind}:${state.phase === 'duel-odgovor' ? 'duel' : 'trka'}`);
      if (q.kind === 'matrica' && (!Array.isArray(q.cells) || q.cells.length < 9)) {
        ruleFailures.push('matrica: pitanje ne nosi svih devet pojmova');
      }
      if (q.kind === 'redosled' && (!Array.isArray(q.items) || q.items.length < 2)) {
        ruleFailures.push('redosled: pitanje ne nosi pojmove za ređanje');
      }
      if (q.kind === 'domino' && !q.steps) {
        ruleFailures.push('domino: pitanje ne kaže koliko koraka niz nosi');
      }
    }
    return;
  }
  const kind = pendingKind;
  if (!kind) return;
  if (state.phase !== 'osvajanje-rezultat' && state.phase !== 'duel-odgovor-rezultat') return;
  pendingKind = null;

  if ((host.question as { kind?: string } | undefined)?.kind !== kind) {
    ruleFailures.push(`${kind}: otkrivanje nije ostalo na ekranu tog pitanja`);
    return;
  }
  const field = revealFieldOf(kind);
  if (field && host[field] == null) {
    ruleFailures.push(`${kind}: otkrivanje ne nosi "${field}"`);
    return;
  }
  const results =
    (host.results as
      | { cells?: number[] | null; order?: number[] | null; score?: number }[]
      | undefined) ?? [];
  if (results.length === 0) {
    ruleFailures.push(`${kind}: otkrivanje ne nosi rezultate igrača`);
    return;
  }
  // Kod matrice se rezultat da proveriti spolja: presek izbora i tačne trojke.
  // Ako se ta dva raziđu, duel poredi broj koji nema veze sa ekranom.
  if (kind === 'matrica') {
    const correct = (host.correctCells as number[] | undefined) ?? [];
    for (const r of results) {
      if (!r.cells) continue;
      const hits = r.cells.filter((c) => correct.includes(c)).length;
      if ((r.score ?? -1) !== hits) {
        ruleFailures.push(`matrica: score ${r.score} ne odgovara ${hits} pogodaka`);
        return;
      }
    }
  }
  // Isto za redosled: broj stavki na tačnom mestu.
  if (kind === 'redosled') {
    const correct = (host.correctOrder as number[] | undefined) ?? [];
    for (const r of results) {
      if (!r.order) continue;
      let hits = 0;
      for (let pos = 0; pos < r.order.length; pos++) {
        if (correct[pos] === r.order[pos]) hits += 1;
      }
      if ((r.score ?? -1) !== hits) {
        ruleFailures.push(`redosled: score ${r.score} ne odgovara ${hits} na mestu`);
        return;
      }
    }
  }
  bump(sawKindReveal, kind);
}

/**
 * Nerešen duel se rešava brojem, i taj broj MORA da se otkrije: posle
 * `duel-broj` ide `duel-broj-rezultat` sa tačnom vrednošću i procenom svakog
 * duelanta. Bez toga se teritorija menjala bez objašnjenja.
 */
let sawDuelBroj = 0;
let sawTiebreakReveal = 0;
let brojPending = false;

function trackTiebreak(state: GameStateLite): void {
  const host = state.data.host as Record<string, unknown>;
  if (state.phase === 'duel-broj') {
    if (!brojPending) {
      brojPending = true;
      sawDuelBroj += 1;
    }
    return;
  }
  if (state.phase !== 'duel-broj-rezultat' || !brojPending) return;
  brojPending = false;

  const q = host.question as { kind?: string; text?: string } | undefined;
  if (q?.kind !== 'broj' || !q.text) {
    ruleFailures.push('tiebreak: otkrivanje nije ostalo na ekranu broj-pitanja');
    return;
  }
  if (typeof host.correctValue !== 'number') {
    ruleFailures.push('tiebreak: otkrivanje ne nosi tačnu vrednost');
    return;
  }
  const duelists = ((host.expectedIds as string[] | undefined) ?? []).length;
  const results = (host.results as { value?: number | null; optionIndex?: number | null }[] | undefined) ?? [];
  if (results.length < duelists) {
    ruleFailures.push('tiebreak: otkrivanje ne nosi procene svih duelanata');
    return;
  }
  // Na ekranu je broj — ako tu stoje izbori sa prethodnog pitanja, otkriva se
  // pogrešan krug.
  if (results.some((r) => r.optionIndex != null)) {
    ruleFailures.push('tiebreak: otkrivanje broja prikazuje odgovore sa izbornog pitanja');
    return;
  }
  sawTiebreakReveal += 1;
}

/**
 * Prozor sa ishodom mora da stigne PRE nego što se tabla promeni, i bez
 * `outcome` u duelu — efekti se izvode iz njegove pojave, pa bi mač pao dok se
 * poruka još čita. Prati se i da tabla u toj fazi zaista miruje.
 */
let ishodBoard: string | null = null;
function trackIshod(state: GameStateLite): void {
  const host = state.data.host as Record<string, unknown>;
  const board = JSON.stringify(host.board);
  if (state.phase === 'duel-ishod') {
    const duel = host.duel as { outcome?: string; pendingOutcome?: string } | undefined;
    if (duel?.outcome) {
      ruleFailures.push('duel-ishod: ishod je vec objavljen kao outcome — efekti krecu prerano');
    }
    if (!duel?.pendingOutcome) {
      ruleFailures.push('duel-ishod: prozor nema sta da prikaze (nema pendingOutcome)');
    }
    if (ishodBoard === null) ishodBoard = board;
    else if (ishodBoard !== board) {
      ruleFailures.push('duel-ishod: tabla se promenila dok je prozor sa ishodom jos stajao');
      ishodBoard = board;
    }
    return;
  }
  ishodBoard = null;
}

function trackSiege(state: GameStateLite): void {
  const host = state.data.host as Record<string, unknown>;
  const duel = host.duel as
    | { attackerId: string; territoryId: string; outcome?: string }
    | undefined;
  if (!duel) return;
  const key = `${state.phase}:${duel.attackerId}:${duel.territoryId}:${duel.outcome ?? ''}`;
  if (key === lastDuelKey) return;
  lastDuelKey = key;

  if (state.phase === 'duel-rezultat' && duel.outcome === 'zid') {
    wallHits += 1;
    pendingSiege = { attackerId: duel.attackerId, territoryId: duel.territoryId };
    return;
  }
  if (state.phase === 'duel-pitanje' && pendingSiege) {
    if (
      duel.attackerId === pendingSiege.attackerId &&
      duel.territoryId === pendingSiege.territoryId
    ) {
      siegeContinued += 1;
      // Kartica sa najavom ide samo na prvi udarac; bez ove zastavice bi se
      // ista poruka ponovila na svaki srušeni zid.
      if (!(duel as { opsadaNastavak?: boolean }).opsadaNastavak) {
        ruleFailures.push('opsada: nastavak nije označen, pa se najava ponavlja');
      }
    } else {
      ruleFailures.push(
        'opsada: posle srušenog zida potez je otišao dalje umesto da napadač nastavi'
      );
    }
    pendingSiege = null;
  }
}

function expect(label: string, actual: unknown, wanted: unknown): void {
  if (actual !== wanted) ruleFailures.push(`${label}: dobijeno ${actual}, očekivano ${wanted}`);
}

function checkDuelRules(): void {
  const yes = { score: 1, qualifies: true, remaining: 10 };
  const no = { score: 0, qualifies: false, remaining: 10 };

  expect('samo napadač tačan', resolveScoredDuel(yes, no), 'napadac');
  expect('samo branilac tačan', resolveScoredDuel(no, yes), 'branilac');
  expect('oba tačna', resolveScoredDuel(yes, yes), 'tiebreak');
  expect('oba netačna', resolveScoredDuel(no, no), 'tiebreak');
  expect('neutralna, tačan', resolveScoredDuel(yes, null), 'napadac');
  expect('neutralna, netačan', resolveScoredDuel(no, null), 'branilac');

  // Matrica: rezultat je 0–3, pa se duel rešava razlikom u pogocima i klizač
  // ostaje samo za pravo izjednačenje. To je i razlog zašto je puštena u duel.
  const m = (score: number) => ({ score, qualifies: score >= 2, remaining: 10 });
  expect('matrica 3:2 nosi napad', resolveScoredDuel(m(3), m(2)), 'napadac');
  expect('matrica 1:2 drži odbrana', resolveScoredDuel(m(1), m(2)), 'branilac');
  expect('matrica 2:2 ide na broj', resolveScoredDuel(m(2), m(2)), 'tiebreak');
  expect('matrica 0:0 ide na broj', resolveScoredDuel(m(0), m(0)), 'tiebreak');
  // Bez branioca nema šta da se poredi, pa odlučuje prag (2 od 3).
  expect('matrica 2/3 uzima neutralnu', resolveScoredDuel(m(2), null), 'napadac');
  expect('matrica 1/3 ne uzima neutralnu', resolveScoredDuel(m(1), null), 'branilac');

  expect(
    'tiebreak: bliži pobeđuje',
    resolveBrojDuel({ score: 0, qualifies: true, remaining: 1, distance: 3 }, { score: 0, qualifies: true, remaining: 9, distance: 8 }),
    'napadac'
  );
  expect(
    'tiebreak: isto odstupanje → brži',
    resolveBrojDuel({ score: 0, qualifies: true, remaining: 9, distance: 5 }, { score: 0, qualifies: true, remaining: 2, distance: 5 }),
    'napadac'
  );
  expect(
    'tiebreak: niko nije odgovorio → branilac drži',
    resolveBrojDuel({ score: 0, qualifies: true, remaining: null, distance: null }, { score: 0, qualifies: true, remaining: null, distance: null }),
    'branilac'
  );
  expect(
    'tiebreak: napadač ćuti → branilac drži',
    resolveBrojDuel({ score: 0, qualifies: true, remaining: null, distance: null }, { score: 0, qualifies: true, remaining: 3, distance: 40 }),
    'branilac'
  );

  expect('obična teritorija pada odmah', duelOutcome(true, false, 0), 'napadac');
  expect('zamak sa 3 zida gubi zid', duelOutcome(true, true, 3), 'zid');
  expect('zamak sa 2 zida gubi zid', duelOutcome(true, true, 2), 'zid');
  expect('poslednji zid ruši zamak', duelOutcome(true, true, 1), 'zamak-pao');
  expect('izgubljen napad ne dira zamak', duelOutcome(false, true, 1), 'branilac');
}

// --- pomoćnici ---------------------------------------------------------------

type AnySocket = Socket<Record<string, (...a: never[]) => void>, Record<string, (...a: never[]) => void>>;

function connect(url: string): AnySocket {
  return io(url, { transports: ['websocket'], forceNew: true }) as unknown as AnySocket;
}

function once<T>(socket: AnySocket, event: string, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`istekao timeout čekajući "${event}"`)),
      timeoutMs
    );
    socket.once(event as never, ((data: T) => {
      clearTimeout(timer);
      resolve(data);
    }) as never);
  });
}

interface GameStateLite {
  phase: string;
  timeRemaining: number;
  data: { host: Record<string, unknown> };
  playerData: Record<string, Record<string, unknown>>;
}

// --- glavni tok --------------------------------------------------------------

async function main(): Promise<void> {
  checkDuelRules();
  loadTextAnswers();
  console.log(
    ruleFailures.length === 0
      ? 'pravila duela: OK'
      : `pravila duela: ${ruleFailures.length} greška(ka)`
  );

  // Rat traje dok ne padne pretposlednji zamak, pa partija ume da bude duga.
  // Pauze se skraćuju na admin minimume (isti put kojim ih i domaćin podešava)
  // — aktivni tajmeri se ionako ne čekaju, jer klijenti odgovaraju odmah pa
  // faza završi ranije.
  const tmpRoot = mkdtempSync(path.join(tmpdir(), 'bitka-'));
  const timingFile = path.join(tmpRoot, 'timing.json');
  // Prijave pitanja se upisuju samo kad store zna svoj fajl — bez ovoga je
  // `recordQuizFeedback` tiho ništa, pa bi test „prošao" i da je pokvareno.
  const feedbackFile = path.join(tmpRoot, 'quiz-feedback.json');
  writeFileSync(
    timingFile,
    JSON.stringify({
      osvajanje: {
        UVOD_DURATION: 3,
        PITANJE_NAJAVA_DURATION: 2,
        REZULTAT_DURATION: 3,
        DUEL_REZULTAT_DURATION: 3,
        LEADERBOARD_DURATION: 4,
      },
    })
  );
  initTimingConfig(timingFile);
  initQuizFeedback(feedbackFile);

  const httpServer = createServer();
  setupSocket(httpServer, '*', {
    questionPacksDir: path.join(REPO_ROOT, 'question-packs'),
    asocijacijePacksDir: path.join(REPO_ROOT, 'asocijacije-packs'),
    bitkaMapsDir: path.join(REPO_ROOT, 'bitka-maps'),
  });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;
  const url = `http://localhost:${port}`;
  console.log(`server na ${url}`);

  const host = connect(url);
  await once(host, 'connect');
  host.emit('host:create-room' as never, { } as never);
  const created = await once<{ roomCode: string }>(host, 'host:room-created');
  const roomCode = created.roomCode;
  console.log(`soba ${roomCode}`);

  const names = ['Pera', 'Mika', 'Zika', 'Laza'].slice(0, PLAYERS);
  const players: AnySocket[] = [];
  const ids: string[] = [];
  for (const name of names) {
    const sock = connect(url);
    await once(sock, 'connect');
    sock.emit('player:join-room' as never, { roomCode, playerName: name } as never);
    const joined = await once<{ player: { id: string } }>(sock, 'player:joined');
    players.push(sock);
    ids.push(joined.player.id);
  }
  console.log(`igrači: ${names.join(', ')}`);

  // Najsvežije stanje po igraču — kontroler ga inače drži u store-u.
  const latest: (GameStateLite | null)[] = names.map(() => null);
  const privateData: (Record<string, unknown> | null)[] = names.map(() => null);
  let ended = false;
  let endedPayload: unknown = null;

  players.forEach((sock, i) => {
    sock.on('game:state-update' as never, ((data: { gameState: GameStateLite }) => {
      latest[i] = data.gameState;
      if (i === 0) {
        scanBroadcast(data.gameState.phase, data.gameState);
        trackIshod(data.gameState);
        trackSiege(data.gameState);
        trackTiebreak(data.gameState);
        trackQuestionKinds(data.gameState);
        trackFeedback(data.gameState, (questionId) => {
          players[0].emit('game:player-action' as never, {
            action: 'quiz:feedback',
            data: { questionId, report: true, rating: 2 },
          } as never);
        });
      }
      act(i);
    }) as never);
    sock.on('game:player-state' as never, ((data: {
      playerData: Record<string, Record<string, unknown>>;
    }) => {
      privateData[i] = data.playerData[ids[i]] ?? null;
      act(i);
    }) as never);
    sock.on('game:started' as never, ((data: { gameState: GameStateLite }) => {
      latest[i] = data.gameState;
      act(i);
    }) as never);
    sock.on('game:ended' as never, ((data: unknown) => {
      ended = true;
      endedPayload = data;
    }) as never);
    sock.on('error' as never, ((data: { message: string }) => {
      console.error(`  ! greška za ${names[i]}: ${data.message}`);
    }) as never);
  });

  const seenPhases = new Set<string>();
  /** Šta je koji igrač već odigrao u ovoj fazi — da ne šalje dvaput. */
  const actedIn = new Map<string, Set<number>>();

  function actionKey(state: GameStateLite): string {
    const host = state.data.host as Record<string, unknown>;
    return [
      state.phase,
      host.round,
      host.osvajanjeRound,
      host.activePlayerId,
      (host.duel as { territoryId?: string } | undefined)?.territoryId,
      (host.question as { text?: string } | undefined)?.text,
    ].join('|');
  }

  function act(i: number): void {
    const state = latest[i];
    if (!state || ended) return;
    const host = state.data.host as Record<string, unknown>;
    const mine = privateData[i] ?? {};

    if (!seenPhases.has(state.phase)) {
      seenPhases.add(state.phase);
      const banner = typeof host.lastEvent === 'string' ? ` — ${host.lastEvent}` : '';
      console.log(`  faza: ${state.phase}${banner}`);
    }

    const key = actionKey(state);
    let acted = actedIn.get(key);
    if (!acted) {
      acted = new Set();
      actedIn.set(key, acted);
    }

    // Domino je jedini tip koji traži VIŠE poteza po pitanju, pa se ključ
    // proširuje korakom — inače bi bot odigrao samo prvi korak niza.
    const dom = mine.domino as
      | { current?: string | null; streak?: number; done?: boolean }
      | undefined;
    if (
      (state.phase === 'osvajanje-odgovor' || state.phase === 'duel-odgovor') &&
      dom &&
      !dom.done &&
      dom.current
    ) {
      const stepKey = `${key}|domino|${dom.streak ?? 0}`;
      let steppedIn = actedIn.get(stepKey);
      if (!steppedIn) {
        steppedIn = new Set();
        actedIn.set(stepKey, steppedIn);
      }
      if (steppedIn.has(i)) return;
      steppedIn.add(i);
      players[i].emit('game:player-action' as never, {
        action: 'bitka:domino',
        data: { answer: Math.random() < 0.5 ? 'before' : 'after' },
      } as never);
      return;
    }

    if (acted.has(i)) return;

    const question = host.question as
      | {
          kind: string;
          options?: unknown[];
          min?: number;
          max?: number;
          cells?: unknown[];
          pick?: number;
          items?: unknown[];
          steps?: number;
          textKind?: string;
          emojis?: string;
          quote?: string;
          scramble?: string;
        }
      | undefined;
    const expected = (host.expectedIds as string[] | undefined) ?? [];
    const selectable = (mine.selectableIds as string[] | undefined) ?? [];

    if (
      (state.phase === 'osvajanje-odgovor' || state.phase === 'duel-odgovor') &&
      question?.kind === 'izbor' &&
      expected.includes(ids[i])
    ) {
      acted.add(i);
      const count = question.options?.length ?? 4;
      players[i].emit('game:player-action' as never, {
        action: 'bitka:answer',
        data: { optionIndex: Math.floor(Math.random() * count) },
      } as never);
      return;
    }

    if (
      (state.phase === 'osvajanje-odgovor' || state.phase === 'duel-odgovor') &&
      question?.kind === 'matrica' &&
      expected.includes(ids[i])
    ) {
      acted.add(i);
      const total = question.cells?.length ?? 9;
      const pick = question.pick ?? 3;
      // Nasumična trojka bez ponavljanja — server odbija duplikate, pa bi
      // lenji `Math.random()` po ćeliji povremeno poslao nevažeći odgovor i
      // tiho oborio fazu na istek vremena umesto na odgovor.
      const bag = Array.from({ length: total }, (_, k) => k);
      const cells: number[] = [];
      for (let k = 0; k < pick && bag.length > 0; k++) {
        cells.push(...bag.splice(Math.floor(Math.random() * bag.length), 1));
      }
      players[i].emit('game:player-action' as never, {
        action: 'bitka:matrica',
        data: { cells },
      } as never);
      return;
    }

    if (
      (state.phase === 'osvajanje-odgovor' || state.phase === 'duel-odgovor') &&
      question?.kind === 'redosled' &&
      expected.includes(ids[i])
    ) {
      acted.add(i);
      const n = question.items?.length ?? 0;
      const bag = Array.from({ length: n }, (_, k) => k);
      const order: number[] = [];
      while (bag.length > 0) {
        order.push(...bag.splice(Math.floor(Math.random() * bag.length), 1));
      }
      players[i].emit('game:player-action' as never, {
        action: 'bitka:order',
        data: { order },
      } as never);
      return;
    }

    if (
      (state.phase === 'osvajanje-odgovor' || state.phase === 'duel-odgovor') &&
      question?.kind === 'tekst' &&
      expected.includes(ids[i])
    ) {
      acted.add(i);
      // Prvo promašaj, pa tačan odgovor: promašaj NE sme da potroši odgovor,
      // pa se oba puta moraju proći. Tačan se traži u paketima (harness ima
      // pravo na to; igrač nema — server ga ne šalje).
      players[i].emit('game:player-action' as never, {
        action: 'bitka:text',
        data: { text: `botov-promasaj-${i}` },
      } as never);
      const answer = textAnswerFor(question);
      // Svaki drugi bot ćuti, pa se prođe i faza koja ide do isteka vremena.
      if (answer && i % 2 === 0) {
        players[i].emit('game:player-action' as never, {
          action: 'bitka:text',
          data: { text: answer },
        } as never);
      }
      return;
    }

    if (
      (state.phase === 'redosled-odgovor' || state.phase === 'duel-broj') &&
      question?.kind === 'broj' &&
      expected.includes(ids[i])
    ) {
      acted.add(i);
      const min = question.min ?? 0;
      const max = question.max ?? 100;
      players[i].emit('game:player-action' as never, {
        action: 'bitka:guess',
        data: { value: min + Math.random() * (max - min) },
      } as never);
      return;
    }

    if (state.phase === 'baza-izbor') {
      // Zamkovi se dižu naizmenično. Ko je na potezu bira; ko nije, namerno
      // pokušava da bira ipak — server to mora da odbije, inače bi pozniji
      // igrač mogao da preotme mesto pre nego što na njega dođe red.
      //
      // Ko je na potezu čita se iz BROADCAST-a, ne iz privatnog dela: privatni
      // deo stiže zasebnom porukom, pa ume da kasni jedan potez — a slati
      // „pokušaj van reda" na osnovu zastarelog podatka znači slati sasvim
      // ispravan potez i onda se čuditi što je prošao.
      const activeId = host.activePlayerId as string | undefined;
      if (activeId === ids[i]) {
        if (selectable.length > 0 && !mine.myBaseChoice) {
          acted.add(i);
          basePicked.set(i, selectable[0]);
          players[i].emit('game:player-action' as never, {
            action: 'bitka:pick',
            data: { territoryId: selectable[0] },
          } as never);
        }
        // Privatni deo još nije stigao — sačekaj sledeće stanje.
        return;
      }
      // Meta pokušaja je VEĆ ZAUZETA teritorija, a ne slobodna. Slobodna bi
      // ušla u trku sa promenom poteza — dok poruka stigne, red je već možda
      // došao na nas, pa bi potez legitimno prošao i test bi lažno pao. Zauzeto
      // mesto ne sme da prođe ni u jednom trenutku, pa je provera čista.
      const taken =
        (host.board as { id: string; ownerId: string | null }[] | undefined)
          ?.filter((c) => c.ownerId !== null)
          .map((c) => c.id) ?? [];
      if (!mine.myBaseChoice && taken.length > 0) {
        acted.add(i);
        players[i].emit('game:player-action' as never, {
          action: 'bitka:pick',
          data: { territoryId: taken[0] },
        } as never);
      }
      return;
    }

    if (state.phase === 'osvajanje-pitanje' && !baseBoard) {
      baseBoard =
        (host.board as { id: string; ownerId: string | null; castle: boolean }[] | undefined) ??
        null;
    }

    if (
      (state.phase === 'osvajanje-izbor' || state.phase === 'napad-izbor') &&
      mine.isActive &&
      selectable.length > 0
    ) {
      acted.add(i);
      // Pravi igrač opseda zamak, ne luta po mapi. Bez ovoga se zidovi skoro
      // nikad ne potroše, pa partija završi na osiguraču od 25 rundi i
      // eliminacija se uopšte ne testira.
      const board = (host.board as { id: string; ownerId: string | null; castle: boolean; walls: number }[]) ?? [];
      const castle = selectable.find((id) => {
        const cell = board.find((c) => c.id === id);
        return cell && cell.castle && cell.walls > 0 && cell.ownerId !== ids[i];
      });
      const target = castle ?? selectable[Math.floor(Math.random() * selectable.length)];
      players[i].emit('game:player-action' as never, {
        action: 'bitka:pick',
        data: { territoryId: target },
      } as never);
    }
  }

  host.emit('host:start-game' as never, {
    gameId: 'osvajanje',
    bitkaMapId: MAP_ID,
    bitkaMode: MODE,
    bitkaRounds: ROUNDS > 0 ? ROUNDS : undefined,
    quizPackIds: PACK_IDS.length > 0 ? PACK_IDS : undefined,
    quizTypes: TYPES.length > 0 ? TYPES : undefined,
  } as never);

  const startError = new Promise<never>((_, reject) => {
    host.on('error' as never, ((data: { message: string }) => {
      reject(new Error(`server je odbio start: ${data.message}`));
    }) as never);
  });

  const finished = new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (ended) {
        clearInterval(timer);
        resolve();
      }
    }, 250);
  });

  await Promise.race([
    finished,
    startError,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('partija nije završila u 20 minuta')), 1_200_000)
    ),
  ]);

  // --- izveštaj --------------------------------------------------------------

  const finalHost = (latest[0]?.data.host ?? {}) as Record<string, unknown>;
  const board = (finalHost.board as { ownerId: string | null }[] | undefined) ?? [];
  const neutral = board.filter((t) => t.ownerId === null).length;
  const finalPlayers =
    (finalHost.players as { name: string; walls: number; eliminated: boolean }[] | undefined) ?? [];
  const standing = finalPlayers.filter((p) => p.walls > 0);
  const lastRound = typeof finalHost.round === 'number' ? finalHost.round : 0;

  console.log('\n--- rezultat ---');
  console.log(`viđene faze (${seenPhases.size}): ${[...seenPhases].join(', ')}`);
  console.log(`teritorija: ${board.length}, neutralnih na kraju: ${neutral}`);
  console.log(`ratnih rundi: ${lastRound}`);
  console.log(
    `zamkova na kraju: ${standing.length} (${standing.map((p) => p.name).join(', ') || '—'})`
  );
  console.log(`ispali: ${finalPlayers.filter((p) => p.eliminated).map((p) => p.name).join(', ') || '—'}`);
  console.log(`završni payload: ${JSON.stringify(endedPayload)}`);

  const required = [
    'uvod',
    'baza-izbor',
    'osvajanje-pitanje',
    'osvajanje-odgovor',
    'osvajanje-izbor',
    'napad-izbor',
    'duel-odgovor',
    'duel-odgovor-rezultat',
    'duel-ishod',
    'duel-rezultat',
    // Završni kadar: konačna mapa + pobednik, pa tek onda `ended`.
    'kraj',
  ];
  const missing = required.filter((p) => !seenPhases.has(p));

  // Svaki igrač mora da stigne na red i sam izabere zamak; ako su neki dobili
  // mesto istekom vremena, red se negde prekinuo.
  if (basePicked.size < PLAYERS) {
    ruleFailures.push(
      `baza-izbor: samo ${basePicked.size}/${PLAYERS} igrača je stiglo na red za zamak`
    );
  }
  // Zamak svakog igrača mora da stoji tamo gde ga je on izabrao NA SVOM potezu.
  // Da je server prihvatio pokušaj van reda, zamak bi završio negde drugde.
  for (const [i, wanted] of basePicked) {
    const castle = (baseBoard ?? []).find((c) => c.castle && c.ownerId === ids[i]);
    if (!castle) {
      ruleFailures.push(`baza-izbor: igrač ${i + 1} nije dobio zamak`);
    } else if (castle.id !== wanted) {
      ruleFailures.push(
        `baza-izbor: igrač ${i + 1} je izabrao ${wanted}, a zamak je završio u ${castle.id} (izbor van reda je prošao?)`
      );
    }
  }

  console.log(`srušenih zidova: ${wallHits}, nastavljenih opsada: ${siegeContinued}`);
  console.log(`nerešenih duela: ${sawDuelBroj}, otkrivenih brojeva: ${sawTiebreakReveal}`);
  for (const [kind, n] of [...sawKind].sort()) {
    console.log(
      `  ${kind}: ${n} (trka ${sawByPhase.get(`${kind}:trka`) ?? 0}, duel ${sawByPhase.get(`${kind}:duel`) ?? 0}), otkriveno ${sawKindReveal.get(kind) ?? 0}`
    );
    // Postavljen tip koji se nikad ne otkrije znači da igrač ne sazna zašto je
    // izgubio zemlju.
    if ((sawKindReveal.get(kind) ?? 0) === 0) {
      ruleFailures.push(`${kind}: nijedno pitanje nije otkriveno kako treba`);
    }
  }
  // Traženi tipovi MORAJU da se pojave — inače je čekiranje tipa opet dugme
  // koje ništa ne radi. Prazan `--pack` ne broji: bez paketa igra uzima
  // ugrađenu banku, koja nosi samo izborna pitanja.
  const kindOf: Record<string, string> = {
    matrica: 'matrica',
    redosled: 'redosled',
    domino: 'domino',
    emoji: 'tekst',
    dopuna: 'tekst',
    anagram: 'tekst',
    obicno: 'izbor',
    uljez: 'izbor',
  };
  if (PACK_IDS.length > 0) {
    for (const ty of TYPES) {
      const kind = kindOf[ty];
      if (kind && !sawKind.has(kind)) {
        ruleFailures.push(`filter tipova: tražen je ${ty}, a nijedno takvo pitanje nije postavljeno`);
      }
    }
  }

  if (missingQuestionIds > 0) {
    ruleFailures.push(
      `prijava pitanja: ${missingQuestionIds} pitanja je stiglo bez id-ja, pa se ne mogu prijaviti`
    );
  }
  if (reportedPrevious) {
    // Zapis mora da postoji iako pitanje odavno nije na ekranu.
    const hit = Object.entries(getQuizFeedback()).find(
      ([, v]) => v.reports > 0 && v.ratingCount > 0
    );
    console.log(
      `prijava prethodnog pitanja: ${hit ? `zapisano pod ${hit[0]}` : 'NIJE zapisano'}`
    );
    if (!hit) {
      ruleFailures.push('prijava pitanja: prijava prethodnog pitanja nije zapisana');
    }
  }

  let failed = false;
  if (ruleFailures.length > 0) {
    console.error('\nFAIL — pravila duela:');
    for (const line of ruleFailures) console.error(`  ${line}`);
    failed = true;
  }
  if (missing.length > 0) {
    console.error(`\nFAIL — faze koje se nisu desile: ${missing.join(', ')}`);
    failed = true;
  }
  if (leaks.length > 0) {
    console.error(`\nFAIL — anti-leak (${leaks.length}):`);
    for (const leak of [...new Set(leaks)]) console.error(`  ${leak}`);
    failed = true;
  }
  // Do poslednjeg zamka: partija sme da se završi samo tako što ostane jedan
  // zamak — ili tako što udari osigurač od zaglavljene partije. Sve između
  // znači da je rat prekinut prerano. Na runde je prekid upravo pravilo, pa se
  // umesto toga proverava da je server prihvatio dogovoren broj rundi.
  if (MODE === 'runde') {
    const total = typeof finalHost.totalRounds === 'number' ? finalHost.totalRounds : 0;
    if (total !== ROUNDS) {
      console.error(`
FAIL — traženo ${ROUNDS} rundi, server igra ${total}.`);
      failed = true;
    }
  } else if (standing.length > 1 && lastRound < 25) {
    console.error(
      `\nFAIL — igra je stala u ${lastRound}. rundi a ${standing.length} zamka još stoje.`
    );
    failed = true;
  }
  if (!failed) console.log('\nOK — ceo tok prošao, bez curenja u broadcastu.');

  host.close();
  for (const sock of players) sock.close();
  httpServer.close();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
