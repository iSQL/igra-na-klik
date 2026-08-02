/**
 * Headless prolaz kroz partiju igre Splav.
 *
 *   npx tsx scripts/test-splav.mts [--players <n>] [--rounds <n>]
 *
 * Diže server u procesu, spaja domaćina i N botova preko `socket.io-client` i
 * odigra celu partiju. Botovi voze na osnovu `game:frame` paketa — isto što
 * radi i pravi telefon, samo bez palca.
 *
 * Zašto uopšte postoji: Splav je prva igra sa fizikom i brzim tikom, pa se
 * klikanjem po UI-ju ne može proveriti ni da li nalet zaista izbacuje, ni da
 * li server pretrpava mrežu punim stanjem 30 puta u sekundi. Test meri i
 * jedno i drugo.
 */

import { createServer } from 'http';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { io, type Socket } from 'socket.io-client';
import type { SplavFrame } from '@igra/shared';
import {
  splavArenaRadius,
  splavSurvivalPoints,
  SPLAV_DASH_COOLDOWN_MS,
  SPLAV_MIN_RADIUS,
  SPLAV_ROUND_MAX_MS,
  SPLAV_START_RADIUS,
} from '@igra/shared';
import { setupSocket } from '../packages/server/src/socket/setup.js';
import { initTimingConfig } from '../packages/server/src/game/timing-config.js';
import {
  createBody,
  startDash,
  stepSimulation,
} from '../packages/server/src/game/games/splav/physics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

const PLAYERS = Math.max(2, Math.min(8, Number(arg('players') ?? 4)));
const ROUNDS = Math.max(2, Math.min(12, Number(arg('rounds') ?? 2)));

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

// --- fizika kao čista funkcija -----------------------------------------------

/** Nalet mora da izbacuje, a običan sudar ne — to je cela taktika igre. */
function checkPhysics(): void {
  const shove = (dash: boolean): number => {
    const a = createBody('a', -0.3, 0);
    const b = createBody('b', 0, 0);
    a.inx = 1;
    a.iny = 0;
    if (dash) startDash(a, 0);
    for (let t = 0; t < 40; t++) stepSimulation([a, b], t * 33, 33);
    return Math.hypot(b.x, b.y);
  };

  const bumped = shove(false);
  const dashed = shove(true);
  check(
    'nalet gura jače od običnog sudara',
    dashed > bumped * 1.5,
    `nalet ${dashed.toFixed(3)} vs sudar ${bumped.toFixed(3)}`
  );

  // Hlađenje: drugi nalet ne sme da krene pre isteka.
  const c = createBody('c', 0, 0);
  c.inx = 1;
  check('prvi nalet prolazi', startDash(c, 0));
  check('nalet u hlađenju ne prolazi', !startDash(c, SPLAV_DASH_COOLDOWN_MS - 50));
  check('nalet posle hlađenja prolazi', startDash(c, SPLAV_DASH_COOLDOWN_MS + 1));

  // Simetrija: dva ista igrača u ogledalu moraju da završe u ogledalu. Ako
  // redosled tela u nizu ikad počne da odlučuje ishod, 1v1 duel bi uvek
  // dobijao isti igrač — a to se sa terena ne vidi.
  const left = createBody('l', -0.25, 0);
  const right = createBody('r', 0.25, 0);
  left.inx = 1;
  right.inx = -1;
  startDash(left, 0);
  startDash(right, 0);
  for (let t = 0; t < 60; t++) stepSimulation([left, right], t * 25, 25);
  check(
    'sudar dva naleta je simetričan',
    Math.abs(left.x + right.x) < 1e-9 && Math.abs(left.y - right.y) < 1e-9,
    `l=${left.x.toFixed(4)} r=${right.x.toFixed(4)}`
  );

  // Splav se samo smanjuje, nikad ne raste.
  let prev = Infinity;
  let monotone = true;
  for (let ms = 0; ms <= SPLAV_ROUND_MAX_MS; ms += 250) {
    const r = splavArenaRadius(ms);
    if (r > prev + 1e-9) monotone = false;
    prev = r;
  }
  check('splav se samo smanjuje', monotone);
  check('splav kreće pun', splavArenaRadius(0) === SPLAV_START_RADIUS);
  check('splav na kraju nestaje', splavArenaRadius(SPLAV_ROUND_MAX_MS) < SPLAV_MIN_RADIUS);

  // Poeni po plasmanu: bolji plasman nosi strogo više.
  const pts = [1, 2, 3, 4].map((rank) => splavSurvivalPoints(rank, 4));
  check(
    'plasman: bolji nosi više',
    pts[0] > pts[1] && pts[1] > pts[2] && pts[2] > pts[3],
    pts.join(' > ')
  );
  check('poslednji ne dobija ništa za plasman', pts[3] === 0);
}

// --- pomoćnici ---------------------------------------------------------------

type AnySocket = Socket<
  Record<string, (...a: never[]) => void>,
  Record<string, (...a: never[]) => void>
>;

function connect(url: string): AnySocket {
  return io(url, { transports: ['websocket'], forceNew: true }) as unknown as AnySocket;
}

function once<T>(socket: AnySocket, event: string, timeoutMs = 20000): Promise<T> {
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
  checkPhysics();
  console.log(
    failures.length === 0 ? 'fizika: OK' : `fizika: ${failures.length} greška(ka)`
  );

  const timingFile = path.join(mkdtempSync(path.join(tmpdir(), 'splav-')), 'timing.json');
  writeFileSync(
    timingFile,
    JSON.stringify({
      splav: { INTRO_DURATION: 2, RUNDA_GOTOVA_DURATION: 3, LEADERBOARD_DURATION: 2 },
    })
  );
  initTimingConfig(timingFile);

  const httpServer = createServer();
  setupSocket(httpServer, '*', {
    questionPacksDir: path.join(REPO_ROOT, 'question-packs'),
  });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;
  const url = `http://localhost:${port}`;
  console.log(`server na ${url}`);

  const host = connect(url);
  await once(host, 'connect');
  host.emit('host:create-room' as never, {} as never);
  const created = await once<{ roomCode: string }>(host, 'host:room-created');
  const roomCode = created.roomCode;
  console.log(`soba ${roomCode} · ${PLAYERS} igrača · ${ROUNDS} rundi`);

  const names = ['Pera', 'Mika', 'Žika', 'Lena', 'Ana', 'Bane', 'Cane', 'Dara'].slice(0, PLAYERS);
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

  // --- merenje saobraćaja ----------------------------------------------------
  // Frames only fly during `borba`, so their own timestamps are the honest
  // clock for "how long was there actually a fight" — deriving it from state
  // updates measures the thing being tested.
  // Measured as the sum of gaps BETWEEN consecutive frames, ignoring the long
  // ones: frames stop between rounds, and counting those pauses as fight time
  // would report a third of the real rate.
  let frameGaps = 0;
  let frameSpanMs = 0;
  let framePrevAt = 0;
  let borbaBroadcasts = 0;
  let phase = '';
  const seenPhases = new Set<string>();
  const roundsSeen = new Set<number>();
  const eliminations: { victim: string; by: string | null; reason: string }[] = [];
  const elimSeqs = new Set<number>();
  let ended = false;
  let endedPayload: { finalScores: { playerId: string; score: number }[]; awards?: unknown[] } | null =
    null;
  let lastFrame: SplavFrame | null = null;
  let roundResults = 0;
  let survivorsAtRoundEnd: number[] = [];

  // Bot: ide na najbližeg protivnika, a naletom udara tek kad je blizu. Ako ga
  // ivica stigne, prvo se vraća na splav.
  const inputTimers: ReturnType<typeof setInterval>[] = [];

  players.forEach((sock, i) => {
    const myId = ids[i];
    let desired = { x: 0, y: 0 };
    let wantDash = false;

    sock.on('game:frame' as never, ((data: { gameId: string; frame: SplavFrame }) => {
      if (data.gameId !== 'splav') return;
      if (i === 0) {
        const now = Date.now();
        if (framePrevAt && now - framePrevAt < 500) {
          frameGaps += 1;
          frameSpanMs += now - framePrevAt;
        }
        framePrevAt = now;
        lastFrame = data.frame;
      }
      const frame = data.frame;
      const me = frame.players.find((p) => p.id === myId);
      if (!me || me.out) {
        desired = { x: 0, y: 0 };
        return;
      }

      const distToEdge = frame.r - Math.hypot(me.x - frame.cx, me.y - frame.cy);
      if (distToEdge < frame.r * 0.28) {
        // Nazad ka sredini pre nego što ivica odluči umesto nas.
        const len = Math.hypot(frame.cx - me.x, frame.cy - me.y) || 1;
        desired = { x: (frame.cx - me.x) / len, y: (frame.cy - me.y) / len };
        return;
      }

      let best: { x: number; y: number; d: number } | null = null;
      for (const other of frame.players) {
        if (other.id === myId || other.out) continue;
        const d = Math.hypot(other.x - me.x, other.y - me.y);
        if (!best || d < best.d) best = { x: other.x, y: other.y, d };
      }
      if (!best) {
        desired = { x: 0, y: 0 };
        return;
      }
      const len = best.d || 1;
      desired = { x: (best.x - me.x) / len, y: (best.y - me.y) / len };
      wantDash = best.d < 0.3 && me.cd >= 1;
    }) as never);

    sock.on('game:state-update' as never, ((data: { gameState: GameStateLite }) => {
      const state = data.gameState;
      if (i !== 0) return;
      if (state.phase === 'borba') borbaBroadcasts += 1;

      if (state.phase !== phase) {
        phase = state.phase;
        if (!seenPhases.has(phase)) {
          seenPhases.add(phase);
          console.log(`  faza: ${phase}`);
        }
      }
      const hostData = state.data.host as Record<string, unknown>;
      roundsSeen.add(Number(hostData.round));

      const elims = (hostData.eliminations ?? []) as {
        seq: number;
        victim: { name: string };
        by: { name: string } | null;
        reason: string;
      }[];
      for (const elim of elims) {
        if (elimSeqs.has(elim.seq)) continue;
        elimSeqs.add(elim.seq);
        eliminations.push({
          victim: elim.victim.name,
          by: elim.by?.name ?? null,
          reason: elim.reason,
        });
        console.log(
          `    💦 ${elim.victim.name} ${elim.by ? `— izgurao ${elim.by.name}` : `(${elim.reason})`}`
        );
      }

      const result = hostData.roundResult as
        | { round: number; winner: { name: string } | null; entries: { rank: number }[] }
        | undefined;
      if (result && roundResults < result.round) {
        roundResults = result.round;
        survivorsAtRoundEnd.push(
          (hostData.roster as { alive: boolean }[]).filter((p) => p.alive).length
        );
        console.log(
          `  runda ${result.round}: ${result.winner ? `pobednik ${result.winner.name}` : 'bez pobednika'}`
        );
      }
    }) as never);

    sock.on('game:ended' as never, ((data: typeof endedPayload) => {
      ended = true;
      endedPayload = data;
    }) as never);

    sock.on('error' as never, ((data: { message: string }) => {
      console.error(`  ! greška za ${names[i]}: ${data.message}`);
    }) as never);

    inputTimers.push(
      setInterval(() => {
        if (ended) return;
        sock.emit('game:player-action' as never, {
          action: 'splav:input',
          data: desired,
        } as never);
        if (wantDash) {
          wantDash = false;
          sock.emit('game:player-action' as never, { action: 'splav:dash', data: {} } as never);
        }
      }, 60)
    );
  });

  host.emit('host:start-game' as never, { gameId: 'splav', roundCount: ROUNDS } as never);

  const deadline = Date.now() + (SPLAV_ROUND_MAX_MS + 12000) * ROUNDS;
  while (!ended && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
  }
  for (const t of inputTimers) clearInterval(t);

  // --- provere ---------------------------------------------------------------

  check('partija se završila', ended);
  check(
    'prošle su sve faze',
    ['intro', 'borba', 'runda-gotova', 'rang-lista'].every((p) => seenPhases.has(p)),
    [...seenPhases].join(', ')
  );
  check('odigrane su sve runde', roundResults === ROUNDS, `${roundResults}/${ROUNDS}`);
  check(
    'svaka runda se završila sa najviše jednim preživelim',
    survivorsAtRoundEnd.every((n) => n <= 1),
    survivorsAtRoundEnd.join(', ')
  );
  check('bilo je izbacivanja', eliminations.length > 0, `${eliminations.length}`);
  check(
    'bar jedno izbacivanje je nekome pripisano',
    eliminations.some((e) => e.by !== null),
    `${eliminations.filter((e) => e.by).length} pripisanih od ${eliminations.length}`
  );

  const scores = endedPayload?.finalScores ?? [];
  check('svi imaju poene na kraju', scores.length === PLAYERS && scores.some((s) => s.score > 0));
  // Platforma namerno ne deli diplome kad poeni nikoga ne rangiraju (nerešeno
  // je u duelu sasvim moguće) — tada ih ne sme biti nijedna, inače po jedna
  // svakome.
  const awards = endedPayload?.awards?.length ?? 0;
  const tied = scores.every((s) => s.score === scores[0].score);
  check(
    'diplome',
    tied ? awards === 0 : awards === PLAYERS,
    tied ? `nerešeno, diploma: ${awards}` : `${awards}/${PLAYERS}`
  );

  // Delta broadcast: pun state sme da ide otprilike jednom u sekundi plus po
  // jednom na izbacivanje. Da modul vraća stanje na svaki tik, ovde bi stajalo
  // ~30/s i ceo trik sa frame paketima ne bi imao smisla.
  const borbaSec = Math.max(1, frameSpanMs / 1000);
  const frameRate = frameGaps / borbaSec;
  const broadcastRate = borbaBroadcasts / borbaSec;
  console.log(
    `\nsaobraćaj tokom borbe (${borbaSec.toFixed(1)}s): ${frameRate.toFixed(1)} frame/s, ` +
      `${broadcastRate.toFixed(1)} punih stanja/s`
  );
  check('frame paketi stižu (~15/s)', frameRate > 10 && frameRate < 20, frameRate.toFixed(1));
  // Puno stanje ide samo kad se nešto stvarno promeni (izbacivanje, faza) —
  // sam sat platforma i ovako pretvara u lagani `game:timer`.
  check(
    'pun state se ne šalje na svaki tik',
    broadcastRate < 3,
    `${broadcastRate.toFixed(1)}/s`
  );
  check('frame paket nosi geometriju splava', !!lastFrame && lastFrame.r > 0);

  // --- ishod -----------------------------------------------------------------

  console.log('');
  if (failures.length === 0) {
    console.log('✅ sve provere prošle');
  } else {
    console.log(`❌ ${failures.length} provera nije prošla:`);
    for (const f of failures) console.log(`   · ${f}`);
  }

  host.close();
  for (const p of players) p.close();
  httpServer.close();
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
