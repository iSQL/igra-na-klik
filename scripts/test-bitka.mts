/**
 * Headless prolaz kroz partiju igre Osvajanje.
 *
 *   npx tsx scripts/test-bitka.ts [--map <id>] [--rounds <n>]
 *
 * Diže server u procesu (bez Vite-a i bez UI-ja), spaja jednog domaćina i tri
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

const MAP_ID = arg('map');
/** Koliko igrača sedne za sto (2 ili 3). */
const PLAYERS = Math.max(2, Math.min(3, Number(arg('players') ?? 3)));

// --- anti-leak ---------------------------------------------------------------

/** Polja koja u broadcastu smeju da postoje samo u fazama otkrivanja. */
const REVEAL_ONLY = ['correctIndex', 'correctValue'];
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

  const names = ['Pera', 'Mika', 'Zika'].slice(0, PLAYERS);
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
      if (i === 0) scanBroadcast(data.gameState.phase, data.gameState);
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

    if (state.phase === 'baza-izbor' && !mine.myBaseChoice && selectable.length > 0) {
      acted.add(i);
      // Namerno svi ciljaju istu teritoriju u prvom krugu — tako se proverava
      // razrešenje sudara po prioritetu.
      players[i].emit('game:player-action' as never, {
        action: 'bitka:pick',
        data: { territoryId: selectable[0] },
      } as never);
      return;
    }

    if (
      (state.phase === 'osvajanje-izbor' || state.phase === 'napad-izbor') &&
      mine.isActive &&
      selectable.length > 0
    ) {
      acted.add(i);
      players[i].emit('game:player-action' as never, {
        action: 'bitka:pick',
        data: { territoryId: selectable[Math.floor(Math.random() * selectable.length)] },
      } as never);
    }
  }

  host.emit('host:start-game' as never, {
    gameId: 'osvajanje',
    bitkaMapId: MAP_ID,
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
  // Partija sme da se završi samo tako što ostane jedan zamak — ili tako što
  // udari osigurač od zaglavljene partije. Sve između znači da je rat prekinut
  // prerano (upravo bug koji je uveo podesiv broj rundi).
  if (standing.length > 1 && lastRound < 25) {
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
