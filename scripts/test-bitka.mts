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
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { io, type Socket } from 'socket.io-client';
import { setupSocket } from '../packages/server/src/socket/setup.js';
import { initTimingConfig } from '../packages/server/src/game/timing-config.js';
import {
  duelOutcome,
  resolveBrojDuel,
  resolveChoiceDuel,
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

// --- anti-leak ---------------------------------------------------------------

/** Polja koja u broadcastu smeju da postoje samo u fazama otkrivanja. */
const REVEAL_ONLY = ['correctIndex', 'correctValue', 'tiebreak'];
/** Polja koja u broadcastu ne smeju da postoje NIKAD. */
const NEVER = ['answer', 'options.correct', 'selectedIndex', 'myGuess', 'baseChoice'];
const REVEAL_PHASES = new Set([
  'redosled-rezultat',
  'osvajanje-rezultat',
  'duel-rezultat',
  'rezultat',
  'ended',
]);

const leaks: string[] = [];

function scanBroadcast(phase: string, payload: unknown): void {
  const json = JSON.stringify(payload);
  for (const key of NEVER) {
    if (json.includes(`"${key}"`)) leaks.push(`[${phase}] broadcast sadrži "${key}"`);
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
 * Nerešen duel se rešava brojem, i taj broj MORA da se otkrije: posle
 * `duel-broj` sledeći `duel-rezultat` nosi `tiebreak` sa tačnom vrednošću i
 * procenom svakog duelanta. Bez toga se teritorija menjala bez objašnjenja.
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
  if (state.phase !== 'duel-rezultat' || !brojPending) return;
  brojPending = false;

  const tb = host.tiebreak as
    | { question?: { text?: string }; correctValue?: number; results?: { value?: number | null }[] }
    | undefined;
  if (!tb || typeof tb.correctValue !== 'number' || !tb.question?.text) {
    ruleFailures.push('tiebreak: posle broj-pitanja ishod nije otkrio tačnu vrednost');
    return;
  }
  const duelists = ((host.expectedIds as string[] | undefined) ?? []).length;
  if ((tb.results?.length ?? 0) < duelists) {
    ruleFailures.push('tiebreak: otkrivanje ne nosi procene svih duelanata');
    return;
  }
  // Izborno pitanje ostaje na ekranu sa SVOJIM odgovorima: ako su tu procene
  // brojeva, snimak izbornog kruga je izgubljen i avatari nemaju šta da sednu.
  const results = (host.results as { value?: number | null }[] | undefined) ?? [];
  if (results.some((r) => r.value != null)) {
    ruleFailures.push('tiebreak: izgubljeni odgovori sa izbornog pitanja');
    return;
  }
  sawTiebreakReveal += 1;
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
  const yes = { correct: true, remaining: 10 };
  const no = { correct: false, remaining: 10 };

  expect('samo napadač tačan', resolveChoiceDuel(yes, no), 'napadac');
  expect('samo branilac tačan', resolveChoiceDuel(no, yes), 'branilac');
  expect('oba tačna', resolveChoiceDuel(yes, yes), 'tiebreak');
  expect('oba netačna', resolveChoiceDuel(no, no), 'tiebreak');
  expect('neutralna, tačan', resolveChoiceDuel(yes, null), 'napadac');
  expect('neutralna, netačan', resolveChoiceDuel(no, null), 'branilac');

  expect(
    'tiebreak: bliži pobeđuje',
    resolveBrojDuel({ correct: true, remaining: 1, distance: 3 }, { correct: true, remaining: 9, distance: 8 }),
    'napadac'
  );
  expect(
    'tiebreak: isto odstupanje → brži',
    resolveBrojDuel({ correct: true, remaining: 9, distance: 5 }, { correct: true, remaining: 2, distance: 5 }),
    'napadac'
  );
  expect(
    'tiebreak: niko nije odgovorio → branilac drži',
    resolveBrojDuel({ correct: true, remaining: null, distance: null }, { correct: true, remaining: null, distance: null }),
    'branilac'
  );
  expect(
    'tiebreak: napadač ćuti → branilac drži',
    resolveBrojDuel({ correct: true, remaining: null, distance: null }, { correct: true, remaining: 3, distance: 40 }),
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
  console.log(
    ruleFailures.length === 0
      ? 'pravila duela: OK'
      : `pravila duela: ${ruleFailures.length} greška(ka)`
  );

  // Rat traje dok ne padne pretposlednji zamak, pa partija ume da bude duga.
  // Pauze se skraćuju na admin minimume (isti put kojim ih i domaćin podešava)
  // — aktivni tajmeri se ionako ne čekaju, jer klijenti odgovaraju odmah pa
  // faza završi ranije.
  const timingFile = path.join(mkdtempSync(path.join(tmpdir(), 'bitka-')), 'timing.json');
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
        trackSiege(data.gameState);
        trackTiebreak(data.gameState);
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
    if (acted.has(i)) return;

    const question = host.question as
      | { kind: string; options?: unknown[]; min?: number; max?: number }
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
    'duel-rezultat',
    'rezultat',
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
