/**
 * Headless prolaz kroz kontrole toka igre (pauza, preskakanje, „ne čekaj ga”,
 * predaja vođenja, prekid sa/bez tabele, ponovno pokretanje probe).
 *
 *   npx tsx scripts/test-flow.mts
 *
 * Diže server u procesu, pravi sobu bez TV-a (Ana drži kontrolu) sa još dva
 * igrača i vozi Kviz kroz sve `host:flow-action` puteve, pa Gluvo doba u
 * probi do kraja probe i `host:restart-game`.
 */

import { createServer } from 'http';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { io, type Socket } from 'socket.io-client';
import { KVIZ_BANK_PACK_ID, type GameFlowState } from '@igra/shared';
import { setupSocket } from '../packages/server/src/socket/setup.js';
import { initTimingConfig } from '../packages/server/src/game/timing-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '✓' : '✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

type AnySocket = Socket<
  Record<string, (...a: never[]) => void>,
  Record<string, (...a: never[]) => void>
>;

function connect(url: string): AnySocket {
  return io(url, { transports: ['websocket'], forceNew: true }) as unknown as AnySocket;
}

function once<T>(socket: AnySocket, event: string, timeoutMs = 5000): Promise<T> {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emit = (s: AnySocket, ev: string, data?: unknown) =>
  s.emit(ev as never, data as never);

interface GameStateLite {
  phase: string;
  round: number;
  totalRounds: number;
  timeRemaining: number;
  data: Record<string, unknown>;
}

/** Live view of one socket: latest state, flow, and the flows seen so far. */
function watch(s: AnySocket) {
  const v = {
    state: null as GameStateLite | null,
    flow: null as GameFlowState | null,
    flows: [] as GameFlowState[],
    timers: 0,
    remoteHost: null as string | null,
    ended: null as null | {
      skipResults?: boolean;
      stoppedEarly?: { round: number; totalRounds: number };
    },
  };
  s.on('game:started' as never, ((d: { gameState: GameStateLite }) => {
    v.state = d.gameState;
    v.ended = null;
  }) as never);
  s.on('game:state-update' as never, ((d: { gameState: GameStateLite }) => {
    v.state = d.gameState;
  }) as never);
  s.on('game:timer' as never, ((d: { timeRemaining: number }) => {
    v.timers++;
    if (v.state) v.state.timeRemaining = d.timeRemaining;
  }) as never);
  s.on('game:flow' as never, ((d: { flow: GameFlowState }) => {
    v.flow = d.flow;
    v.flows.push(d.flow);
  }) as never);
  s.on('game:ended' as never, ((d: typeof v.ended) => {
    v.ended = d;
  }) as never);
  s.on('room:remote-host-changed' as never, ((d: { remoteHostPlayerId: string | null }) => {
    v.remoteHost = d.remoteHostPlayerId;
  }) as never);
  return v;
}

async function until(label: string, pred: () => boolean, ms = 8000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(40);
  }
  check(label, false, 'uslov nije ispunjen na vreme');
  return false;
}

async function main(): Promise<void> {
  const timingFile = path.join(mkdtempSync(path.join(tmpdir(), 'flow-')), 'timing.json');
  writeFileSync(
    timingFile,
    JSON.stringify({ quiz: { SHOWING_QUESTION_DURATION: 1, SHOWING_RESULTS_DURATION: 1 } })
  );
  initTimingConfig(timingFile);

  const httpServer = createServer();
  setupSocket(httpServer, '*', {
    questionPacksDir: path.join(REPO_ROOT, 'question-packs'),
  });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const url = `http://localhost:${(httpServer.address() as { port: number }).port}`;

  const ana = connect(url);
  await once(ana, 'connect');
  const va = watch(ana);
  emit(ana, 'player:create-room', { playerName: 'Ana' });
  const created = await once<{ player: { id: string }; room: { code: string } }>(
    ana,
    'player:joined'
  );
  const roomCode = created.room.code;
  const anaId = created.player.id;

  const join = async (name: string) => {
    const s = connect(url);
    await once(s, 'connect');
    const v = watch(s);
    emit(s, 'player:join-room', { roomCode, playerName: name });
    const j = await once<{ player: { id: string } }>(s, 'player:joined');
    return { s, v, id: j.player.id };
  };
  const bane = await join('Bane');
  const cane = await join('Cane');

  const answer = (s: AnySocket) =>
    emit(s, 'game:player-action', { action: 'quiz:answer', data: { optionIndex: 0 } });
  const flowAction = (s: AnySocket, action: string, playerId?: string) =>
    emit(s, 'host:flow-action', { action, playerId });
  const phase = () => va.state?.phase;

  // --- Kviz ------------------------------------------------------------
  emit(ana, 'host:start-game', {
    gameId: 'quiz',
    quizPackIds: [KVIZ_BANK_PACK_ID],
    quizTypes: ['obicno'],
    roundCount: 5,
  });
  await until('kviz: stiže faza odgovaranja', () => phase() === 'answering');
  await until('flow: collection sa 3 očekivana', () => va.flow?.collection?.expectedIds.length === 3);
  check('flow: skipLabel u odgovaranju', va.flow?.skipLabel === 'Preskoči pitanje', String(va.flow?.skipLabel));
  check('flow: runde u flow-u', (va.flow?.totalRounds ?? 0) > 0);

  // Pauza: sat stoji, odgovor se odbija.
  answer(bane.s);
  await until('flow: Bane se vodi kao gotov', () => !!va.flow?.collection?.doneIds?.includes(bane.id));
  flowAction(bane.s, 'pause');
  await sleep(300);
  check('pauza: igrač bez kontrole ne može da pauzira', va.flow?.paused === false);
  flowAction(ana, 'pause');
  await until('pauza: flow.paused', () => va.flow?.paused === true);
  check('pauza: pausedBy je Ana', va.flow?.pausedBy === 'Ana', String(va.flow?.pausedBy));
  const frozenAt = va.state?.timeRemaining;
  const timersBefore = va.timers;
  answer(cane.s);
  await sleep(2300);
  check('pauza: nema otkucaja sata', va.timers === timersBefore, `${va.timers - timersBefore} otkucaja`);
  check('pauza: sat stoji', va.state?.timeRemaining === frozenAt);
  check(
    'pauza: odgovor tokom pauze se ne prima',
    !va.flow?.collection?.doneIds?.includes(cane.id)
  );
  flowAction(ana, 'skip');
  await sleep(300);
  check('pauza: preskakanje ne radi dok je pauza', phase() === 'answering');

  // Nastavak: 3-2-1 pa sat kreće.
  const flowsBefore = va.flows.length;
  flowAction(ana, 'resume');
  await until('nastavak: igra više nije pauzirana', () => va.flow?.paused === false, 5000);
  const countdown = va.flows.slice(flowsBefore).map((f) => f.resumeCountdown);
  check(
    'nastavak: 3-2-1 odbrojavanje',
    [3, 2, 1].every((n) => countdown.includes(n as 3)),
    JSON.stringify(countdown)
  );
  const timersAfterResume = va.timers;
  await sleep(1300);
  check('nastavak: sat ponovo otkucava', va.timers > timersAfterResume || phase() !== 'answering');

  // Ne čekaj: Ana odgovori, Cane se preskoči — pitanje se zatvara.
  answer(ana);
  await sleep(200);
  check('ne čekaj: pre toga i dalje odgovaranje', phase() === 'answering');
  flowAction(ana, 'stop-waiting', cane.id);
  await until('ne čekaj: pitanje se zatvara bez Caneta', () => phase() === 'showing-results');
  check('ne čekaj: Cane u notWaitingIds', !!va.flow?.notWaitingIds.includes(cane.id));

  // Sledeće pitanje: i dalje ga ne čekamo.
  await until('sledeće pitanje', () => phase() === 'answering');
  await until(
    'ne čekaj: važi i za novo pitanje',
    () => !!va.flow?.collection && !va.flow.collection.expectedIds.includes(cane.id)
  );
  answer(ana);
  answer(bane.s);
  await until('ne čekaj: drugo pitanje se zatvara bez Caneta', () => phase() === 'showing-results');

  // Cane odgovori na sledeće — vraća se u čekanje.
  await until('treće pitanje', () => phase() === 'answering');
  answer(cane.s);
  await until('povratak: Cane više nije u notWaitingIds', () => !va.flow?.notWaitingIds.includes(cane.id));

  // Preskoči pitanje.
  flowAction(ana, 'skip');
  await until('preskoči: pitanje se zatvara', () => phase() === 'showing-results');

  // Predaja vođenja.
  emit(bane.s, 'host:transfer-remote-host', { playerId: cane.id });
  await sleep(300);
  check('predaja: igrač bez kontrole ne može da preda', va.remoteHost === null || va.remoteHost === anaId);
  emit(ana, 'host:transfer-remote-host', { playerId: bane.id });
  await until('predaja: Bane drži kontrolu', () => va.remoteHost === bane.id);
  flowAction(ana, 'pause');
  await sleep(300);
  check('predaja: Ana više ne može da pauzira', va.flow?.paused === false);

  // Prekid bez rezultata.
  const roundAtStop = va.state?.round;
  emit(bane.s, 'host:stop-game', { showResults: false });
  await until('prekid: game:ended', () => !!va.ended);
  check('prekid: skipResults', va.ended?.skipResults === true);
  check(
    'prekid: stoppedEarly nosi rundu',
    va.ended?.stoppedEarly?.round === roundAtStop,
    JSON.stringify(va.ended?.stoppedEarly)
  );

  // Prekid sa tabelom.
  await sleep(600);
  emit(bane.s, 'host:start-game', {
    gameId: 'quiz',
    quizPackIds: [KVIZ_BANK_PACK_ID],
    quizTypes: ['obicno'],
    roundCount: 3,
  });
  await until('kviz 2: počinje', () => !!va.state && !va.ended && phase() === 'showing-question');
  await sleep(600);
  emit(bane.s, 'host:stop-game', { showResults: true });
  await until('prekid 2: game:ended', () => !!va.ended);
  check('prekid 2: bez skipResults', !va.ended?.skipResults);
  check('prekid 2: stoppedEarly postoji', !!va.ended?.stoppedEarly);

  // Ponovno pokretanje iste igre.
  await sleep(600);
  emit(bane.s, 'host:restart-game', { tutorial: false });
  await until('restart: ista igra opet kreće', () => !va.ended && phase() === 'showing-question');
  await sleep(600); // start/stop dele throttle od 500 ms
  emit(bane.s, 'host:stop-game', { showResults: false });
  await until('restart: zaustavljeno', () => !!va.ended);

  // Stari klijent bez payload-a i dalje radi kao „pokaži tabelu”.
  await sleep(600);
  emit(bane.s, 'host:restart-game', { tutorial: false });
  await until('restart 2: kreće', () => !va.ended && !!va.state);
  await sleep(600);
  emit(bane.s, 'host:stop-game');
  await until('prekid bez payload-a: game:ended', () => !!va.ended);
  check('prekid bez payload-a: nije skipResults', !va.ended?.skipResults);

  // --- Odigrane igre + proba (Gluvo doba traži 6 igrača) -----------------
  const extra = [];
  for (const name of ['Đura', 'Eva', 'Fića']) extra.push(await join(name));
  const late = connect(url);
  await once(late, 'connect');
  emit(late, 'player:join-room', { roomCode, playerName: 'Gaga', playedGames: ['spijun', 'nepostojeca'] });
  const lateJoined = await once<{
    player: { playedGames?: string[] };
    room: { players: { name: string; playedGames?: string[] }[] };
  }>(late, 'player:joined');
  check(
    'odigrano: server pamti Kviz za sve iz sobe',
    !!lateJoined.room.players.find((p) => p.name === 'Ana')?.playedGames?.includes('quiz')
  );
  check(
    'odigrano: lista sa telefona se čisti',
    JSON.stringify(lateJoined.player.playedGames) === JSON.stringify(['spijun']),
    JSON.stringify(lateJoined.player.playedGames)
  );

  await sleep(600);
  emit(bane.s, 'host:start-game', { gameId: 'gluvo-doba', gluvoDobaTutorial: true });
  await until('proba: Gluvo doba kreće', () => !va.ended && phase() === 'podela-uloga');
  check('proba: tutorialMode', va.state?.data.tutorialMode === true);
  const seen: string[] = [];
  for (let i = 0; i < 14 && va.state?.data.tutorialDone !== true; i++) {
    const before = phase();
    if (before && !seen.includes(before)) seen.push(before);
    if (before === 'noc') {
      check(
        'proba: noću flow nosi samo broj, ne ko je odigrao',
        !!va.flow?.collection && va.flow.collection.doneIds === undefined,
        JSON.stringify(va.flow?.collection)
      );
    }
    emit(bane.s, 'host:game-action', { action: 'gluvo:next-phase' });
    await until(`proba: faza posle "${before}" se menja`, () =>
      phase() !== before || va.state?.data.tutorialDone === true
    );
  }
  check('proba: stiže do „Spremni ste!”', va.state?.data.tutorialDone === true, seen.join(' → '));
  check('proba: samo jedna noć', seen.filter((p) => p === 'noc').length === 1, seen.join(' → '));
  check('proba: igra ne završava sama', !va.ended);

  await sleep(600);
  emit(bane.s, 'host:restart-game', { tutorial: false });
  await until('restart: prava partija kreće', () => phase() === 'podela-uloga' && va.state?.data.tutorialMode === false);
  await sleep(600);
  emit(bane.s, 'host:stop-game', { showResults: false });
  await until('restart: zaustavljeno', () => !!va.ended);

  // --- Preskoči u ostalim igrama: svaki skip pomera fazu, ništa ne puca ---
  const SKIP_GAMES = [
    'dve-istine-i-laz',
    'fake-artist',
    'ko-sam-ja',
    'slozilica',
    'draw-guess',
    'spot-it',
    'slepi-telefoni',
    'hot-potato',
    'ko-bi-pre',
    'fibbage',
    'tajni-agenti',
    'asocijacije',
    'spijun',
    'bedem',
    'povuci-potegni',
  ];
  for (const gameId of SKIP_GAMES) {
    await sleep(600);
    va.flow = null;
    emit(bane.s, 'host:start-game', { gameId, ...(gameId === 'tajni-agenti' ? { tajniAgentiMode: 'classic' } : {}) });
    const started = await until(`${gameId}: kreće`, () => !va.ended && va.state?.gameId === gameId, 6000);
    if (!started) continue;
    if (gameId === 'tajni-agenti') {
      emit(bane.s, 'host:game-action', { action: 'tajni-agenti:auto-balance' });
      await sleep(200);
      emit(bane.s, 'host:game-action', { action: 'tajni-agenti:start-round' });
    }
    if (gameId === 'dve-istine-i-laz') {
      // Preskakanje pisanja traži bar dve izjave (inače bi igra stala).
      await sleep(300);
      for (const s of [ana, bane.s]) {
        emit(s, 'game:player-action', {
          action: 'dveistine:submit',
          data: { truth1: 'Volim planine', truth2: 'Imam psa Žuću', lie: 'Bio sam na Mesecu' },
        });
      }
    }
    // Vruć krompir: dok bomba gori nema preskakanja — čeka se eksplozija.
    // Bomba koja gori i Špijunovo pogađanje lokacije se ne preskaču.
    // Bedem: samo gradnja se preskače, a talas traje duže od čekanja ispod.
    const minMoves = gameId === 'hot-potato' || gameId === 'spijun' || gameId === 'bedem' ? 1 : 2;
    const sig = () => `${va.state?.phase}|${va.state?.round}|${JSON.stringify(va.state?.data ?? {})}`;
    let moved = 0;
    for (let i = 0; i < 6 && !va.ended; i++) {
      // Tiho: faza bez preskakanja (npr. poslednji rezultat) nije greška.
      const end = Date.now() + 20000;
      while (!va.flow?.skipLabel && !va.ended && Date.now() < end) await sleep(40);
      if (!va.flow?.skipLabel || va.ended) break;
      const before = sig();
      emit(bane.s, 'host:flow-action', { action: 'skip' });
      const changed = await until(
        `${gameId}: „${va.flow?.skipLabel}” pomera igru`,
        () => !!va.ended || sig() !== before,
        3000
      );
      if (!changed) break;
      moved++;
    }
    check(`${gameId}: preskakanje radi (${moved}×)`, moved >= minMoves);
    if (!va.ended) {
      await sleep(600);
      emit(bane.s, 'host:stop-game', { showResults: false });
      await until(`${gameId}: zaustavljeno`, () => !!va.ended);
    }
  }

  for (const s of [ana, bane.s, cane.s, late, ...extra.map((e) => e.s)]) s.close();
  httpServer.close();

  console.log('');
  if (failures.length > 0) {
    console.log(`PALO: ${failures.length}`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('Sve prošlo.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
