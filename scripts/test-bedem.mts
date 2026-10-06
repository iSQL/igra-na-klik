/**
 * Bedem — balans i headless prolaz.
 *
 *   npx tsx scripts/test-bedem.mts                 # balans + socket prolaz za oba režima
 *   npx tsx scripts/test-bedem.mts --balance       # samo balans (brzo, bez soketa)
 *   npx tsx scripts/test-bedem.mts --games 200     # koliko partija po kombinaciji u balansu
 *   npx tsx scripts/test-bedem.mts --mode protiv --players 3   # samo jedan socket prolaz
 *
 * Balans vozi BedemModule direktno (lažna soba, simulirani tik od 50 ms), pa
 * stotine partija prođu za par sekundi. Dva bota: „pohlepni" gradi pored
 * staze i nadograđuje, „pasivni" ne radi ništa. Provere: pohlepni mora često
 * (ali ne uvek) da odbrani standard, pasivni mora brzo da padne, a
 * beskonačna partija mora da se završi.
 *
 * Socket prolaz diže server u procesu, spaja domaćina i botove preko
 * socket.io-client-a i odigra partiju dok jedan bot ne padne — proverava
 * žice (akcije, faze, frame paketi, kraj igre, diplome) i saobraćaj.
 */

import { createServer } from 'http';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { io, type Socket } from 'socket.io-client';
import type {
  BedemFrame,
  BedemHostData,
  BedemLength,
  BedemMode,
  BedemTowerType,
  GameState,
  Room,
} from '@igra/shared';
import {
  BEDEM_TOWERS,
  bedemBuildable,
  bedemPathCells,
  bedemPathPoint,
  bedemPathLength,
  bedemUpgradeCost,
  BEDEM_TICK_MS,
} from '@igra/shared';
import { BedemModule } from '../packages/server/src/game/games/bedem/BedemModule.js';
import { setupSocket } from '../packages/server/src/socket/setup.js';
import { initTimingConfig } from '../packages/server/src/game/timing-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const TRACE = flag('trace');

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  const line = `${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  if (!ok) failures.push(line);
}

// --- bot -------------------------------------------------------------------

type Action = { action: string; data: Record<string, unknown> };

const BUILD_CYCLE: BedemTowerType[] = [
  'strelac',
  'strelac',
  'katapult',
  'led',
  'strelac',
  'munja',
  'katapult',
  'strelac',
  'munja',
  'led',
];

/** Cells ranked by how much path they see — computed once per layout. */
const cellRankCache = new Map<string, [number, number][]>();
function rankedCells(host: BedemHostData): [number, number][] {
  const cached = cellRankCache.get(host.layoutId);
  if (cached) return cached;
  const cells = bedemPathCells(host.path);
  const len = bedemPathLength(host.path);
  const samples: { x: number; y: number }[] = [];
  for (let d = 0; d <= len; d += 0.5) samples.push(bedemPathPoint(host.path, d));
  const out: { c: number; r: number; v: number }[] = [];
  for (let r = 0; r < host.rows; r++) {
    for (let c = 0; c < host.cols; c++) {
      if (!bedemBuildable(host, cells, c, r)) continue;
      const v = samples.filter((p) => Math.hypot(p.x - c - 0.5, p.y - r - 0.5) <= 2.5).length;
      out.push({ c, r, v });
    }
  }
  out.sort((a, b) => b.v - a.v);
  const ranked = out.map((o) => [o.c, o.r] as [number, number]);
  cellRankCache.set(host.layoutId, ranked);
  return ranked;
}

/**
 * One decision for the greedy bot: build the next tower of its cycle on the
 * best free cell, otherwise upgrade its cheapest tower. Returns null when it
 * can't afford anything. In 'protiv' it also sends wolves when rich.
 */
function greedyMove(
  host: BedemHostData,
  phase: string,
  myId: string,
  gold: number,
  mapIndex: number
): Action | null {
  const map = host.maps[mapIndex];
  if (!map || !map.alive) return null;
  const mine = map.towers.filter((t) => t.ownerId === myId);

  if (host.mode === 'protiv' && phase === 'talas' && gold > 160) {
    return { action: 'bedem:send', data: { unit: gold > 220 ? 'oklopnik' : 'roj' } };
  }

  const wantMore = mine.length < 3 + host.wave;
  if (wantMore) {
    const type = BUILD_CYCLE[mine.length % BUILD_CYCLE.length];
    const cost = BEDEM_TOWERS[type].levels[0].cost;
    if (gold >= cost) {
      const taken = new Set(map.towers.map((t) => `${t.c},${t.r}`));
      // Spread the team out: each bot starts its search at a different offset.
      const cells = rankedCells(host).filter(([c, r]) => !taken.has(`${c},${r}`));
      const pick = cells[0];
      if (pick) return { action: 'bedem:build', data: { c: pick[0], r: pick[1], tower: type } };
    }
  }
  const upgradable = mine
    .map((t) => ({ t, cost: bedemUpgradeCost(t.type, t.level) }))
    .filter((u): u is { t: (typeof mine)[number]; cost: number } => u.cost !== null)
    .sort((a, b) => a.cost - b.cost);
  if (upgradable[0] && gold >= upgradable[0].cost && (!wantMore || gold > 150)) {
    return { action: 'bedem:upgrade', data: { towerId: upgradable[0].t.id } };
  }
  return null;
}

// --- balans: modul bez soketa ----------------------------------------------

function fakeRoom(players: number): Room {
  return {
    code: 'TST',
    hostSocketId: null,
    hostless: true,
    remoteHostPlayerId: null,
    players: Array.from({ length: players }, (_, i) => ({
      id: `p${i}`,
      name: `Bot${i}`,
      avatarColor: '#888888',
      avatarEmoji: '🤖',
      isConnected: true,
      score: 0,
      reconnectToken: `t${i}`,
    })),
    status: 'in-game',
    currentGameId: 'bedem',
    settings: { maxPlayers: 8, roundCount: 1 },
    createdAt: 0,
    chatMessages: [],
    hostConnected: true,
    idleSince: null,
  };
}

interface SimOutcome {
  won: boolean;
  waves: number;
  /** protiv: the winner's index */
  winner: number;
  simSeconds: number;
  /** lives left on the first map */
  lives: number;
}

function simulateGame(
  mode: BedemMode,
  length: BedemLength,
  players: number,
  passive: (i: number) => boolean
): SimOutcome {
  const room = fakeRoom(players);
  const mod = new BedemModule();
  let state: GameState = mod.onStart(room, { bedemMode: mode, bedemLength: length });
  let simMs = 0;
  let actAccum = 0;
  const limit = 60 * 60 * 1000;

  while (state.phase !== 'ended' && simMs < limit) {
    const canAct = state.phase === 'gradnja' || (state.phase === 'talas' && actAccum >= 1000);
    if (canAct) {
      actAccum = 0;
      for (let i = 0; i < players; i++) {
        if (passive(i)) {
          if (state.phase === 'gradnja') {
            const next = mod.onPlayerAction(room, state, `p${i}`, 'bedem:ready', {});
            if (next) state = next;
          }
          continue;
        }
        // Several purchases per decision point, then ready.
        for (let k = 0; k < 6; k++) {
          const h = state.data.host as BedemHostData;
          const pd = state.playerData[`p${i}`] as unknown as { gold: number; mapIndex: number } | undefined;
          if (!pd) break;
          const move = greedyMove(h, state.phase, `p${i}`, pd.gold, pd.mapIndex);
          if (!move) break;
          const next = mod.onPlayerAction(room, state, `p${i}`, move.action, move.data);
          if (!next) break;
          state = next;
        }
        if (state.phase === 'gradnja') {
          const next = mod.onPlayerAction(room, state, `p${i}`, 'bedem:ready', {});
          if (next) state = next;
        }
      }
    }
    const next = mod.onTick(room, state, BEDEM_TICK_MS);
    mod.getPendingFrame();
    if (next) {
      if (TRACE && next.phase !== state.phase && (next.phase === 'gradnja' || next.phase === 'kraj')) {
        const h = next.data.host as BedemHostData;
        const golds = h.roster.map((r) => r.gold).join('/');
        const towers = h.maps.map((m) => m.towers.map((t) => t.type[0] + t.level).join(' ')).join(' | ');
        console.log(`    talas ${h.wave}: životi ${h.maps.map((m) => m.lives).join('/')} · zlato ${golds} · ${towers}`);
      }
      state = next;
    }
    simMs += BEDEM_TICK_MS;
    actAccum += BEDEM_TICK_MS;
  }

  const host = state.data.host as BedemHostData;
  const result = host.result;
  const winnerId = result?.entries[0]?.playerId ?? 'p0';
  return {
    won: result?.won ?? false,
    waves: result?.wavesSurvived ?? 0,
    winner: Number(winnerId.slice(1)),
    simSeconds: simMs / 1000,
    lives: host.maps[0]?.lives ?? 0,
  };
}

function balance(games: number): void {
  console.log(`\n— balans (${games} partija po kombinaciji) —`);

  // The bot is deterministic up to the random layout, so a win rate alone
  // says little — the lives it has left say how close the wall came to falling.
  for (const players of [1, 2, 4, 6, 8]) {
    let wins = 0;
    let waves = 0;
    let lives = 0;
    let minutes = 0;
    for (let g = 0; g < games; g++) {
      const o = simulateGame('zajedno', 'standard', players, () => false);
      if (o.won) wins++;
      waves += o.waves;
      lives += o.lives;
      minutes += o.simSeconds / 60;
    }
    const rate = wins / games;
    const avgLives = lives / games;
    check(
      `zajedno/standard, ${players} pohlepn${players === 1 ? 'i' : 'ih'}: odbrani, ali ne čisto`,
      rate >= 0.6 && avgLives <= 17,
      `${Math.round(rate * 100)}% pobeda, prosečno ${(waves / games).toFixed(1)} talasa, ` +
        `${avgLives.toFixed(1)} života na kraju, ${(minutes / games).toFixed(1)} min`
    );
  }

  {
    let waves = 0;
    let maxWaves = 0;
    for (let g = 0; g < games; g++) {
      const o = simulateGame('zajedno', 'standard', 2, () => true);
      waves += o.waves;
      maxWaves = Math.max(maxWaves, o.waves);
    }
    check('zajedno: pasivni tim pada brzo', maxWaves <= 3, `najviše ${maxWaves}, prosečno ${(waves / games).toFixed(1)} talasa`);
  }

  {
    let waves = 0;
    let max = 0;
    let min = Infinity;
    for (let g = 0; g < games; g++) {
      const o = simulateGame('zajedno', 'beskonacno', 3, () => false);
      waves += o.waves;
      max = Math.max(max, o.waves);
      min = Math.min(min, o.waves);
    }
    const avg = waves / games;
    check('beskonačno se završava (pohlepni tim padne)', max < 60, `${min}–${max} talasa, prosečno ${avg.toFixed(1)}`);
    check('beskonačno traje duže od standarda', avg > 10, avg.toFixed(1));
  }

  {
    let greedyWins = 0;
    for (let g = 0; g < games; g++) {
      const o = simulateGame('protiv', 'standard', 2, (i) => i === 1);
      if (o.winner === 0) greedyWins++;
    }
    check('protiv: pohlepni pobeđuje pasivnog', greedyWins === games, `${greedyWins}/${games}`);
  }

  {
    const counts = [0, 0, 0];
    let waves = 0;
    for (let g = 0; g < games; g++) {
      const o = simulateGame('protiv', 'beskonacno', 3, () => false);
      counts[o.winner]++;
      waves += o.waves;
    }
    check(
      'protiv/beskonačno među pohlepnima se završi i niko ne dominira po mestu za stolom',
      counts.every((c) => c > 0 || games < 10),
      `pobede ${counts.join(' / ')}, prosečno ${(waves / games).toFixed(1)} talasa`
    );
  }
}

// --- socket prolaz ---------------------------------------------------------

type AnySocket = Socket<
  Record<string, (...a: never[]) => void>,
  Record<string, (...a: never[]) => void>
>;

function connect(url: string): AnySocket {
  return io(url, { transports: ['websocket'], forceNew: true }) as unknown as AnySocket;
}

function once<T>(socket: AnySocket, event: string, timeoutMs = 20000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`istekao timeout čekajući "${event}"`)), timeoutMs);
    socket.once(event as never, ((data: T) => {
      clearTimeout(timer);
      resolve(data);
    }) as never);
  });
}

async function socketRun(url: string, mode: BedemMode, players: number): Promise<void> {
  console.log(`\n— socket prolaz: ${mode}, ${players} igrača —`);
  const host = connect(url);
  await once(host, 'connect');
  host.emit('host:create-room' as never, {} as never);
  const { roomCode } = await once<{ roomCode: string }>(host, 'host:room-created');

  const names = ['Pera', 'Mika', 'Žika', 'Lena', 'Ana', 'Bane', 'Cane', 'Dara'].slice(0, players);
  const socks: AnySocket[] = [];
  const ids: string[] = [];
  for (const name of names) {
    const sock = connect(url);
    await once(sock, 'connect');
    sock.emit('player:join-room' as never, { roomCode, playerName: name } as never);
    const joined = await once<{ player: { id: string } }>(sock, 'player:joined');
    socks.push(sock);
    ids.push(joined.player.id);
  }

  // Bot 0 plays greedy; everyone else is passive so the game ends quickly.
  const seenPhases = new Set<string>();
  let ended = false;
  let endedPayload: { finalScores: { playerId: string; score: number }[]; awards?: unknown[] } | null = null;
  let frames = 0;
  let frameSpanMs = 0;
  let framePrev = 0;
  let talasStates = 0;
  let towersSeen = 0;
  let shotsSeen = 0;
  let maxEnemies = 0;
  let sendsSeen = 0;
  let latest: GameState | null = null;
  let myPd: { gold: number; mapIndex: number } | null = null;
  let lastAct = 0;

  socks.forEach((sock, i) => {
    sock.on('game:frame' as never, ((data: { gameId: string; frame: BedemFrame }) => {
      if (data.gameId !== 'bedem' || i !== 0) return;
      const now = Date.now();
      if (framePrev && now - framePrev < 500) {
        frames++;
        frameSpanMs += now - framePrev;
      }
      framePrev = now;
      for (const m of data.frame.maps) {
        shotsSeen += m.s.length;
        maxEnemies = Math.max(maxEnemies, m.e.length);
        if (m.p?.length) sendsSeen++;
      }
    }) as never);

    sock.on('game:state-update' as never, ((data: { gameState: GameState }) => {
      if (i !== 0) return;
      latest = data.gameState;
      if (!seenPhases.has(latest.phase)) {
        seenPhases.add(latest.phase);
        console.log(`  faza: ${latest.phase}`);
      }
      if (latest.phase === 'talas') talasStates++;
      const h = latest.data.host as BedemHostData;
      towersSeen = Math.max(towersSeen, ...h.maps.map((m) => m.towers.length));
    }) as never);

    sock.on('game:player-state' as never, ((data: { playerData: Record<string, unknown> }) => {
      if (i !== 0) return;
      myPd = data.playerData[ids[0]] as typeof myPd;
    }) as never);

    sock.on('game:ended' as never, ((data: typeof endedPayload) => {
      ended = true;
      endedPayload = data;
    }) as never);
    sock.on('error' as never, ((data: { message: string }) => {
      console.error(`  ! greška za ${names[i]}: ${data.message}`);
    }) as never);
  });

  const readied = new Set<string>();
  const sentWaves = new Set<number>();
  const timer = setInterval(() => {
    const st = latest as GameState | null;
    if (!st || ended) return;
    const h = st.data.host as BedemHostData;
    if (st.phase === 'gradnja') {
      const key = `${h.wave}`;
      if (!readied.has(key)) {
        readied.add(key);
        // Greedy bot buys a burst, then everyone is ready.
        socks.forEach((sock, i) => {
          if (i === 0) {
            const pd = myPd;
            const move = greedyMove(h, st.phase, ids[0], pd?.gold ?? 0, pd?.mapIndex ?? 0);
            if (move) sock.emit('game:player-action' as never, move as never);
          }
        });
        setTimeout(() => {
          for (const sock of socks) sock.emit('game:player-action' as never, { action: 'bedem:ready', data: {} } as never);
        }, 400);
      }
    } else if (st.phase === 'talas' && Date.now() - lastAct > 800) {
      lastAct = Date.now();
      // One cheap send per wave, so the incoming warning is exercised even
      // when the opponent falls before the bot gets rich.
      if (mode === 'protiv' && !sentWaves.has(h.wave) && (myPd?.gold ?? 0) >= 20) {
        sentWaves.add(h.wave);
        socks[0].emit('game:player-action' as never, { action: 'bedem:send', data: { unit: 'vuk' } } as never);
        return;
      }
      const pd = myPd;
      const move = greedyMove(h, st.phase, ids[0], pd?.gold ?? 0, pd?.mapIndex ?? 0);
      if (move) socks[0].emit('game:player-action' as never, move as never);
    }
  }, 150);

  host.emit('host:start-game' as never, { gameId: 'bedem', bedemMode: mode, bedemLength: 'kratko' } as never);

  const deadline = Date.now() + 6 * 60 * 1000;
  while (!ended && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
  clearInterval(timer);

  check('partija se završila', ended);
  check(
    'prošle su sve faze',
    ['uvod', 'gradnja', 'talas', 'kraj'].every((p) => seenPhases.has(p)),
    [...seenPhases].join(', ')
  );
  check('kule su sagrađene', towersSeen > 0, `${towersSeen}`);
  check('kule pucaju', shotsSeen > 0, `${shotsSeen} hitaca`);
  check('neprijatelji su stigli na mapu', maxEnemies > 0, `najviše ${maxEnemies} odjednom`);
  if (mode === 'protiv') check('slanje stiže kao najava na tuđoj mapi', sendsSeen > 0, `${sendsSeen} frejmova`);
  const scores = endedPayload?.finalScores ?? [];
  check('svi imaju rezultat', scores.length === players, `${scores.length}`);
  const awards = endedPayload?.awards?.length ?? 0;
  const tied = scores.every((s) => s.score === scores[0]?.score);
  check('diplome', tied ? awards === 0 : awards === players, `${awards}/${players}`);

  const sec = Math.max(1, frameSpanMs / 1000);
  const rate = frames / sec;
  console.log(`  saobraćaj: ${rate.toFixed(1)} frame/s, ${talasStates} punih stanja tokom ${sec.toFixed(0)} s talasa`);
  check('frame paketi stižu (~10/s)', rate > 6 && rate < 14, rate.toFixed(1));
  check('pun state se ne šalje na svaki tik', talasStates / sec < 3, (talasStates / sec).toFixed(2));

  for (const s of socks) s.disconnect();
  host.disconnect();
}

async function main(): Promise<void> {
  if (TRACE) {
    const players = Number(arg('players') ?? 1);
    const mode = (arg('mode') as BedemMode | undefined) ?? 'zajedno';
    const length = (arg('length') as BedemLength | undefined) ?? 'standard';
    console.log(`trag: ${mode}/${length}, ${players} pohlepnih`);
    const o = simulateGame(mode, length, players, () => false);
    console.log(`  → ${o.won ? 'pobeda' : 'poraz'}, ${o.waves} talasa, ${Math.round(o.simSeconds / 60)} min igre`);
    return;
  }
  const only = arg('mode') as BedemMode | undefined;
  if (!only) balance(Math.max(5, Number(arg('games') ?? 40)));
  if (flag('balance')) return;

  const timingFile = path.join(mkdtempSync(path.join(tmpdir(), 'bedem-')), 'timing.json');
  writeFileSync(timingFile, JSON.stringify({ bedem: { UVOD_DURATION: 2, KRAJ_DURATION: 4 } }));
  initTimingConfig(timingFile);
  const httpServer = createServer();
  setupSocket(httpServer, '*', { questionPacksDir: path.join(REPO_ROOT, 'question-packs') });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const url = `http://localhost:${(httpServer.address() as { port: number }).port}`;

  const players = Math.max(2, Math.min(8, Number(arg('players') ?? 2)));
  for (const mode of only ? [only] : (['zajedno', 'protiv'] as BedemMode[])) {
    await socketRun(url, mode, players);
  }
  httpServer.close();
}

main()
  .catch((err) => {
    console.error(err);
    failures.push(String(err));
  })
  .finally(() => {
    console.log(failures.length === 0 ? '\nSVE OK' : `\n${failures.length} greška(ka)`);
    process.exit(failures.length === 0 ? 0 : 1);
  });

