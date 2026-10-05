/**
 * Headless prolaz kroz "Pokucaj" (kucanje na sobu u kojoj igra već traje).
 *
 *   npx tsx scripts/test-knock.mts
 *
 * Diže server u procesu, pravi sobu bez TV-a (osnivač drži kontrolu) i
 * proverava sve puteve kroz vrata: odbijanje i pauzu od 60 s, puštanje usred
 * Kviza (lateJoin), puštanje u igri koja ne prima usred partije (sedište tek
 * na kraju), kucanje na koje niko ne odgovori (ulazi kad se igra završi),
 * gosta koji zatvori tab, pokušaj da neko ko NE drži kontrolu otvori vrata, i
 * da spisak kucanja nikad ne stigne do telefona koji ne drži kontrolu.
 */

import { createServer } from 'http';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { io, type Socket } from 'socket.io-client';
import { KVIZ_BANK_PACK_ID } from '@igra/shared';
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

/** Resolves true if `event` arrives within `ms`, false otherwise. */
function arrives(socket: AnySocket, event: string, ms = 600): Promise<boolean> {
  return once(socket, event, ms).then(
    () => true,
    () => false
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emit = (s: AnySocket, ev: string, data?: unknown) =>
  s.emit(ev as never, data as never);

interface GameStateLite {
  phase: string;
  data: Record<string, unknown>;
}

interface KnockList {
  knocks: { knockId: string; name: string; entry: string }[];
}

async function main(): Promise<void> {
  const timingFile = path.join(mkdtempSync(path.join(tmpdir(), 'knock-')), 'timing.json');
  // Kratke pauze između pitanja, da Kviz brzo dođe do sledećeg pitanja.
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

  // Osnivač (Ana) drži kontrolu; Bane i Cane su obični igrači.
  const ana = connect(url);
  await once(ana, 'connect');
  emit(ana, 'player:create-room', { playerName: 'Ana' });
  const created = await once<{ room: { code: string } }>(ana, 'player:joined');
  const roomCode = created.room.code;

  const plain: AnySocket[] = [];
  for (const name of ['Bane', 'Cane']) {
    const s = connect(url);
    await once(s, 'connect');
    emit(s, 'player:join-room', { roomCode, playerName: name });
    await once(s, 'player:joined');
    plain.push(s);
  }
  const [bane] = plain;

  // Bane ne drži kontrolu — nijedan neprazan spisak kucanja ne sme da mu stigne.
  let leakedToBane = false;
  bane.on('room:knocks' as never, ((d: KnockList) => {
    if (d.knocks.length > 0) leakedToBane = true;
  }) as never);

  // Ana's latest door list. Two room:knocks arrive back to back (a room-wide
  // reset, then the holder's list), so one-shot listeners race; track it.
  let anaKnocks: KnockList['knocks'] = [];
  ana.on('room:knocks' as never, ((d: KnockList) => {
    anaKnocks = d.knocks;
  }) as never);
  const knockOf = async (name: string) => {
    for (let i = 0; i < 50; i++) {
      const k = anaKnocks.find((x) => x.name === name);
      if (k) return k;
      await sleep(50);
    }
    throw new Error(`kucanje "${name}" nije stiglo do domaćina`);
  };

  const guest = async (name: string) => {
    const s = connect(url);
    await once(s, 'connect');
    return s;
  };

  // --- 0. Soba u lobiju ne prima kucanje -------------------------------
  const early = await guest('Rani');
  emit(early, 'player:knock', { roomCode, playerName: 'Rani' });
  const earlyErr = await once<{ code: string }>(early, 'error').catch(() => null);
  check('lobi: kucanje se odbija (uđi direktno)', earlyErr?.code === 'KNOCK_ERROR');
  early.disconnect();

  // --- Kviz (lateJoin) ---------------------------------------------------
  emit(ana, 'host:start-game', {
    gameId: 'quiz',
    quizPackIds: [KVIZ_BANK_PACK_ID],
    roundCount: 5,
  });
  await once(ana, 'game:started');
  await sleep(1500); // pitanja se učitavaju asinhrono

  // --- 1. Odbijanje + pauza --------------------------------------------
  const dejan = await guest('Dejan');
  emit(dejan, 'player:knock', { roomCode, playerName: 'Dejan' });
  const dStatus = await once<{ state: string; entry: string; holderName: string; progress: unknown }>(
    dejan,
    'knock:status'
  );
  check('gost dobija status "pending"', dStatus.state === 'pending');
  check('Kviz: ulaz "next-round"', dStatus.entry === 'next-round', dStatus.entry);
  check('status nosi ime domaćina', dStatus.holderName === 'Ana', String(dStatus.holderName));
  check('status nosi napredak igre', dStatus.progress !== null);
  const dejanKnock = await knockOf('Dejan');
  check('domaćin vidi kucanje', !!dejanKnock);

  // Neko ko NE drži kontrolu ne može da otvori vrata.
  emit(bane, 'host:answer-knock', { knockId: dejanKnock.knockId, admit: true });
  check('Bane (bez kontrole) ne može da pusti', !(await arrives(dejan, 'player:joined')));

  emit(ana, 'host:answer-knock', { knockId: dejanKnock.knockId, admit: false });
  const closed = await once<{ reason: string; retryAt?: number }>(dejan, 'knock:closed');
  check('odbijanje: knock:closed declined', closed.reason === 'declined');
  check(
    'odbijanje: pauza ~60 s',
    !!closed.retryAt && closed.retryAt - Date.now() > 55_000,
    String(closed.retryAt)
  );
  await sleep(1100); // throttle 1 s po socketu
  emit(dejan, 'player:knock', { roomCode, playerName: 'Dejan' });
  const again = await once<{ reason: string }>(dejan, 'knock:closed');
  check('ponovno kucanje u pauzi se odmah odbija', again.reason === 'declined');

  // --- 2. Puštanje usred Kviza -----------------------------------------
  const ema = await guest('Ema');
  const baneSawJoin = once<{ player: { name: string } }>(bane, 'room:player-joined');
  emit(ema, 'player:knock', { roomCode, playerName: 'Ema' });
  const emaKnock = await knockOf('Ema');
  emit(ana, 'host:answer-knock', { knockId: emaKnock.knockId, admit: true });
  const [emaJoined, emaStarted, seen] = await Promise.all([
    once<{ player: { id: string }; room: { status: string } }>(ema, 'player:joined'),
    once<{ gameId: string }>(ema, 'game:started'),
    baneSawJoin,
  ]);
  check('Ema ulazi odmah (soba u igri)', emaJoined.room.status === 'in-game');
  check('Ema dobija tekuću igru', emaStarted.gameId === 'quiz');
  check('ostali vide Emu', seen.player.name === 'Ema');

  // Ema zaista igra: na sledećem pitanju je među očekivanim odgovaračima.
  // Svi odgovaraju odmah, da pitanja brzo teku (rano zatvaranje faze).
  const emaId = emaJoined.player.id;
  const answered = new Set<string>();
  for (const s of [ana, ...plain, ema]) {
    s.on('game:state-update' as never, ((d: { gameState: GameStateLite }) => {
      const gs = d.gameState;
      const key = `${s.id}:${gs.data.questionIndex}`;
      if (gs.phase === 'answering' && !answered.has(key)) {
        answered.add(key);
        emit(s, 'game:player-action', { action: 'quiz:answer', data: { optionIndex: 0 } });
      }
    }) as never);
  }
  const startIndex = await new Promise<number>((resolve) => {
    ema.once('game:state-update' as never, ((d: { gameState: GameStateLite }) =>
      resolve(d.gameState.data.questionIndex as number)) as never);
  }).catch(() => -1);
  const playsNext = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 60_000);
    ema.on('game:state-update' as never, ((d: { gameState: GameStateLite }) => {
      const gs = d.gameState;
      const ids = (gs.data.expectedIds as string[] | undefined) ?? [];
      if (
        gs.phase === 'answering' &&
        (gs.data.questionIndex as number) > startIndex &&
        ids.includes(emaId)
      ) {
        clearTimeout(timer);
        resolve(true);
      }
    }) as never);
  });
  check('Ema je među odgovaračima na sledećem pitanju', playsNext);

  // --- 3. Kucanje bez odgovora: ulazi kad se igra završi ---------------
  const filip = await guest('Filip');
  emit(filip, 'player:knock', { roomCode, playerName: 'Filip' });
  await once(filip, 'knock:status');
  await sleep(1100);
  emit(ana, 'host:stop-game');
  const filipJoined = await once<{ room: { status: string } }>(filip, 'player:joined');
  check('na kraju igre ulazi i neodgovoreno kucanje', filipJoined.room.status === 'lobby');

  // --- 4. Igra bez lateJoin: puštanje čeka kraj ------------------------
  await sleep(1100);
  emit(ana, 'host:start-game', { gameId: 'ko-bi-pre', roundCount: 5 });
  await once(ana, 'game:started');
  const goca = await guest('Goca');
  emit(goca, 'player:knock', { roomCode, playerName: 'Goca' });
  const gStatus = await once<{ entry: string }>(goca, 'knock:status');
  check('Ko bi pre: ulaz "after-game"', gStatus.entry === 'after-game', gStatus.entry);
  const gocaKnock = await knockOf('Goca');
  emit(ana, 'host:answer-knock', { knockId: gocaKnock.knockId, admit: true });
  const admitted = await once<{ state: string }>(goca, 'knock:status');
  check('puštena, ali čeka kraj igre', admitted.state === 'admitted');
  check('ne sedi pre kraja igre', !(await arrives(goca, 'player:joined')));

  // --- 5. Gost zatvori tab ---------------------------------------------
  const hana = await guest('Hana');
  emit(hana, 'player:knock', { roomCode, playerName: 'Hana' });
  await once(hana, 'knock:status');
  await knockOf('Hana');
  hana.disconnect();
  await sleep(400);
  check('zatvoren tab briše kucanje', !anaKnocks.some((k) => k.name === 'Hana'));

  await sleep(1100);
  emit(ana, 'host:stop-game');
  const gocaJoined = await once<{ room: { status: string } }>(goca, 'player:joined');
  check('puštena gošća sedi kad se igra završi', gocaJoined.room.status === 'lobby');

  // --- 6. Ime koje je već u sobi ---------------------------------------
  await sleep(1100);
  emit(ana, 'host:start-game', { gameId: 'ko-bi-pre', roundCount: 5 });
  await once(ana, 'game:started');
  const dupe = await guest('Bane2');
  emit(dupe, 'player:knock', { roomCode, playerName: 'Bane' });
  const dupeClosed = await once<{ reason: string }>(dupe, 'knock:closed');
  check('zauzeto ime se odbija', dupeClosed.reason === 'name-taken');

  check('spisak kucanja nikad ne stiže igraču bez kontrole', !leakedToBane);

  for (const s of [ana, ...plain, dejan, ema, filip, goca, dupe]) s.disconnect();
  httpServer.close();

  if (failures.length) {
    console.log(`\n${failures.length} PROVERA PALO`);
    process.exit(1);
  }
  console.log('\nSve provere prošle.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
