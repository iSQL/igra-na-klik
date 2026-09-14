/**
 * Headless prolaz kroz partiju igre Puzla.
 *
 *   npx tsx scripts/test-puzla.mts [--players <n>] [--pieces 16|36|64|100]
 *                                  [--rotation] [--relaxed] [--hostless] [--full]
 *
 * Diže server u procesu, spaja domaćina i N botova preko `socket.io-client`,
 * otprema ručno sklopljen JPEG i složi celu sliku.
 *
 * Zašto uopšte postoji: ništa od onoga što Puzlu drži na okupu se ne vidi sa
 * ekrana — da se ivice dva suseda poklapaju tačka po tačka, da se pomeranje
 * ne pretvara u pun state 15 puta u sekundi, da komadić ispadne iz ruke
 * igrača kome se ugasio telefon, da otpremanje slike nikad ne ćuti.
 *
 * `--full` dodaje proveru otpuštanja posle 10 s neaktivnosti (sporo).
 */

import { createServer } from 'http';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { io, type Socket } from 'socket.io-client';
import type {
  PuzlaFrame,
  PuzlaGeometry,
  PuzlaHostData,
  PuzlaPathSink,
  PuzlaUploadAck,
} from '@igra/shared';
import {
  PUZLA_IDLE_RELEASE_MS,
  PUZLA_PIECE_OPTIONS,
  PUZLA_WIRE_SCALE,
  puzlaBuildGeometry,
  puzlaClampOrigin,
  puzlaEdges,
  puzlaIsBorderPiece,
  puzlaNeighbours,
  puzlaPad,
  puzlaPieceCenter,
  puzlaScatter,
  puzlaSnapDistance,
  tracePuzlaPiece,
} from '@igra/shared';
import { setupSocket } from '../packages/server/src/socket/setup.js';
import { initTimingConfig } from '../packages/server/src/game/timing-config.js';
import {
  FRAME_GROUP_ID,
  resolveDrop,
  type PuzlaBoard,
} from '../packages/server/src/game/games/puzla/snap.js';
import { parseJpegSize } from '../packages/server/src/game/games/puzla/puzla-image-store.js';

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

// At most 7 bots: the "Gost" guest below makes it 8, Puzla's cap.
const PLAYERS = Math.max(1, Math.min(7, Number(arg('players') ?? 3)));
const PIECES = Number(arg('pieces') ?? 16);
const ROTATION = flag('rotation');
const RELAXED = flag('relaxed');
const HOSTLESS = flag('hostless');
const FULL = flag('full');

const failures: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- čista geometrija ----------------------------------------------------------

type Pt = { x: number; y: number };

/** Records the outline as edges: each edge is the list of points it passes through. */
class RecordingSink implements PuzlaPathSink {
  pts: Pt[] = [];
  cmds: Pt[][] = [];
  moveTo(x: number, y: number) {
    this.pts.push({ x, y });
  }
  lineTo(x: number, y: number) {
    this.pts.push({ x, y });
    this.cmds.push([{ x, y }]);
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) {
    const seg = [
      { x: a, y: b },
      { x: c, y: d },
      { x, y },
    ];
    this.pts.push(...seg);
    this.cmds.push(seg);
  }
  closePath() {}
}

/** Split a traced piece into its four edges, each with its starting point. */
function pieceEdges(geo: PuzlaGeometry, c: number, r: number): Pt[][] {
  const edges = puzlaEdges(geo.seed, geo.cols, geo.rows);
  const sink = new RecordingSink();
  tracePuzlaPiece(sink, edges, c, r, geo.pw, geo.ph, c * geo.pw, r * geo.ph);
  const hasEdge = [r > 0, c < geo.cols - 1, r < geo.rows - 1, c > 0];
  const out: Pt[][] = [];
  let cursor = sink.pts[0];
  let k = 0;
  for (const has of hasEdge) {
    const n = has ? 3 : 1;
    const pts: Pt[] = [cursor];
    for (let i = 0; i < n; i++) pts.push(...sink.cmds[k + i]);
    k += n;
    cursor = pts[pts.length - 1];
    out.push(pts);
  }
  return out;
}

const near = (a: Pt, b: Pt, eps = 1e-9) =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;

function checkGeometry(): void {
  // 1. Neighbours share every point of their common edge, reversed.
  for (const aspect of [0.5, 1, 4 / 3]) {
    const geo = puzlaBuildGeometry(12345, 36, Math.round(900 * aspect), 900, false);
    let mismatch = 0;
    let padBreach = 0;
    const pad = puzlaPad(geo.pw, geo.ph);
    for (let r = 0; r < geo.rows; r++) {
      for (let c = 0; c < geo.cols; c++) {
        const e = pieceEdges(geo, c, r);
        if (c < geo.cols - 1) {
          const right = e[1];
          const left = pieceEdges(geo, c + 1, r)[3];
          const rev = [...left].reverse();
          if (right.length !== rev.length || right.some((p, i) => !near(p, rev[i]))) mismatch++;
        }
        if (r < geo.rows - 1) {
          const bottom = e[2];
          const top = pieceEdges(geo, c, r + 1)[0];
          const rev = [...top].reverse();
          if (bottom.length !== rev.length || bottom.some((p, i) => !near(p, rev[i]))) mismatch++;
        }
        // 2. Knobs stay inside the sprite padding (control hull ⊇ curve).
        const x0 = c * geo.pw - pad;
        const y0 = r * geo.ph - pad;
        const x1 = (c + 1) * geo.pw + pad;
        const y1 = (r + 1) * geo.ph + pad;
        for (const p of e.flat()) {
          if (p.x < x0 - 1e-9 || p.x > x1 + 1e-9 || p.y < y0 - 1e-9 || p.y > y1 + 1e-9) {
            padBreach++;
          }
        }
      }
    }
    check(`ivice suseda se poklapaju (aspect ${aspect.toFixed(2)})`, mismatch === 0, `${mismatch} ivica`);
    check(`jezičci ostaju u paddingu (aspect ${aspect.toFixed(2)})`, padBreach === 0, `${padBreach} tačaka`);
  }

  // 3. Layout fits and scatter deals every piece outside the frame.
  for (const pieces of PUZLA_PIECE_OPTIONS) {
    for (const aspect of [1 / 3, 0.75, 1, 1.5, 3]) {
      for (const rotation of [false, true]) {
        const geo = puzlaBuildGeometry(99, pieces, Math.round(1200 * aspect), 1200, rotation);
        const total = geo.cols * geo.rows;
        const label = `raspored ${pieces} kom, aspect ${aspect.toFixed(2)}${rotation ? ', rot' : ''}`;
        const fw = geo.cols * geo.pw;
        const fh = geo.rows * geo.ph;
        check(
          `${label}: ram je na stolu`,
          geo.frameX >= 0 && geo.frameY >= 0 && geo.frameX + fw <= geo.tableW + 1e-9 && geo.frameY + fh <= geo.tableH + 1e-9
        );
        check(
          `${label}: broj komadića blizu traženog`,
          Math.abs(total - pieces) <= pieces * 0.35,
          `${geo.cols}×${geo.rows}=${total}`
        );
        const dealt = puzlaScatter(geo, rotation);
        check(`${label}: svi komadići podeljeni`, dealt.length === total);
        let onFrame = 0;
        let offTable = 0;
        for (const s of dealt) {
          const cc = puzlaPieceCenter(geo, s.x, s.y, s.rot, s.piece);
          if (cc.x > geo.frameX && cc.x < geo.frameX + fw && cc.y > geo.frameY && cc.y < geo.frameY + fh) onFrame++;
          if (cc.x < 0 || cc.x > geo.tableW || cc.y < 0 || cc.y > geo.tableH) offTable++;
        }
        check(`${label}: ništa rastureno preko rama`, onFrame === 0, `${onFrame}`);
        check(`${label}: ništa van stola`, offTable === 0, `${offTable}`);
      }
    }
  }

  // 4. Clamp keeps a lone piece on the table.
  const geo = puzlaBuildGeometry(7, 16, 1000, 1000, false);
  const clamped = puzlaClampOrigin(geo, -5, 99, 0, [0]);
  const cc = puzlaPieceCenter(geo, clamped.x, clamped.y, 0, 0);
  check('clamp drži komadić na stolu', cc.x >= 0 && cc.y <= geo.tableH + 1e-9);

  // 5. JPEG size parser.
  const size = parseJpegSize(makeJpeg(800, 600));
  check('JPEG parser čita dimenzije', size?.width === 800 && size?.height === 600, JSON.stringify(size));
}

// --- snap kao čista funkcija ------------------------------------------------------

function boardFor(geo: PuzlaGeometry): PuzlaBoard {
  const groups = new Map();
  groups.set(FRAME_GROUP_ID, { id: 0, x: geo.frameX, y: geo.frameY, rot: 0, z: 0, pieces: [] });
  const pieceGroup: number[] = [];
  const total = geo.cols * geo.rows;
  for (let p = 0; p < total; p++) {
    // Loose, far from the frame and from each other.
    groups.set(p + 1, { id: p + 1, x: 10 + p * 3, y: 10, rot: 0, z: p + 1, pieces: [p] });
    pieceGroup[p] = p + 1;
  }
  return { geo, groups, pieceGroup };
}

function checkSnap(): void {
  const geo = puzlaBuildGeometry(5, 16, 1000, 1000, false); // 4×4
  const snap = puzlaSnapDistance(geo);
  const none = () => false;
  const place = (b: PuzlaBoard, piece: number, x: number, y: number, rot = 0) => {
    const g = b.groups.get(b.pieceGroup[piece])!;
    g.x = x;
    g.y = y;
    g.rot = rot;
  };

  let b = boardFor(geo);
  place(b, 0, 0.3, 0.3);
  place(b, 1, 0.3 + snap * 0.5, 0.3);
  let res = resolveDrop(b, b.pieceGroup[1], none);
  check('susedi blizu se spajaju', res.merges === 1 && res.pairs === 1, JSON.stringify(res));
  check('spojeni dele grupu', b.pieceGroup[0] === b.pieceGroup[1]);

  b = boardFor(geo);
  place(b, 0, 0.3, 0.3);
  place(b, 1, 0.3 + snap * 1.2, 0.3);
  res = resolveDrop(b, b.pieceGroup[1], none);
  check('predaleko se ne spaja', res.merges === 0);

  b = boardFor(geo);
  place(b, 0, 0.3, 0.3, 0);
  place(b, 1, 0.3, 0.3, 1);
  res = resolveDrop(b, b.pieceGroup[1], none);
  check('različito okrenuti se ne spajaju', res.merges === 0);

  b = boardFor(geo);
  place(b, 0, 0.3, 0.3);
  place(b, 1, 0.3, 0.3);
  const heldGroup = b.pieceGroup[0];
  res = resolveDrop(b, b.pieceGroup[1], (gid) => gid === heldGroup);
  check('ne spaja se sa grupom koju drugi drži', res.merges === 0);

  b = boardFor(geo);
  place(b, 0, 0.3, 0.3);
  place(b, 5, 0.3, 0.3); // (1,1) is not a neighbour of (0,0)
  res = resolveDrop(b, b.pieceGroup[5], none);
  check('dijagonala nije spoj', res.merges === 0);

  b = boardFor(geo);
  place(b, 5, geo.frameX, geo.frameY); // interior piece, empty frame
  res = resolveDrop(b, b.pieceGroup[5], none);
  check('unutrašnji komadić ne ide u prazan ram', res.merges === 0);
  place(b, 1, geo.frameX + snap * 0.3, geo.frameY);
  res = resolveDrop(b, b.pieceGroup[1], none);
  check('ivični komadić ide u ram', res.locked && b.pieceGroup[1] === FRAME_GROUP_ID, JSON.stringify(res));
  // Piece 5 was already sitting at the frame origin, touching 1 — that same
  // drop sweeps it in too, credited to whoever dropped 1.
  check('drop povlači i komadić koji već leži na mestu', b.pieceGroup[5] === FRAME_GROUP_ID);

  b = boardFor(geo);
  place(b, 0, 0.3, 0.3);
  place(b, 2, 0.3, 0.3);
  place(b, 1, 0.3, 0.3);
  res = resolveDrop(b, b.pieceGroup[1], none);
  check('lanac: jedan drop zatvara dva spoja', res.merges === 2 && res.pairs === 2, JSON.stringify(res));

  b = boardFor(geo);
  for (let p = 0; p < 16; p++) place(b, p, geo.frameX, geo.frameY);
  res = resolveDrop(b, b.pieceGroup[0], none);
  check(
    'cela slika u jednom potezu završava u ramu',
    b.groups.get(FRAME_GROUP_ID)!.pieces.length === 16 && res.pairs === 24,
    JSON.stringify(res)
  );
}

// --- JPEG ---------------------------------------------------------------------------

/** Smallest header our parser (and any honest JPEG reader) accepts: SOI, SOF0, SOS, EOI. */
function makeJpeg(width: number, height: number, padTo = 0): Buffer {
  const head = Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  ]);
  const tail = Buffer.from([0xff, 0xd9]);
  const filler = Buffer.alloc(Math.max(0, padTo - head.length - tail.length), 0x55);
  return Buffer.concat([head, filler, tail]);
}

// --- sockets --------------------------------------------------------------------------

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

function upload(sock: AnySocket, bytes: Buffer): Promise<PuzlaUploadAck> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT (bez ack-a)' }), 5000);
    sock.emit('host:puzla-image' as never, { bytes } as never, ((res: PuzlaUploadAck) => {
      clearTimeout(timer);
      resolve(res);
    }) as never);
  });
}

interface GameStateLite {
  phase: string;
  timeRemaining: number;
  data: { host: PuzlaHostData };
}

// --- glavni tok -------------------------------------------------------------------------

async function main(): Promise<void> {
  checkGeometry();
  checkSnap();
  console.log(failures.length === 0 ? 'geometrija + snap: OK' : `geometrija + snap: ${failures.length} greška(ka)`);

  const timingFile = path.join(mkdtempSync(path.join(tmpdir(), 'puzla-')), 'timing.json');
  writeFileSync(timingFile, JSON.stringify({ puzla: { PREGLED_DURATION: 3, KRAJ_DURATION: 4 } }));
  initTimingConfig(timingFile);

  const httpServer = createServer();
  setupSocket(httpServer, '*', {});
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;
  const url = `http://localhost:${port}`;
  console.log(
    `server na ${url} · ${PLAYERS} igrača · ${PIECES} kom${ROTATION ? ' · okretanje' : ''}` +
      `${RELAXED ? ' · opušteno' : ''}${HOSTLESS ? ' · bez TV-a' : ''}`
  );

  // --- soba ---------------------------------------------------------------------
  const names = ['Pera', 'Mika', 'Žika', 'Lena', 'Ana', 'Bane', 'Cane', 'Dara'].slice(0, PLAYERS);
  const bots: AnySocket[] = [];
  const ids: string[] = [];
  let host: AnySocket | null = null;
  let roomCode = '';

  if (HOSTLESS) {
    const creator = connect(url);
    await once(creator, 'connect');
    creator.emit('player:create-room' as never, { playerName: names[0] } as never);
    const joined = await once<{ player: { id: string }; room: { code: string } }>(creator, 'player:joined');
    roomCode = joined.room.code;
    bots.push(creator);
    ids.push(joined.player.id);
  } else {
    host = connect(url);
    await once(host, 'connect');
    host.emit('host:create-room' as never, {} as never);
    roomCode = (await once<{ roomCode: string }>(host, 'host:room-created')).roomCode;
  }
  for (const name of names.slice(bots.length)) {
    const sock = connect(url);
    await once(sock, 'connect');
    sock.emit('player:join-room' as never, { roomCode, playerName: name } as never);
    const joined = await once<{ player: { id: string } }>(sock, 'player:joined');
    bots.push(sock);
    ids.push(joined.player.id);
  }
  // A guest whose phone "dies" mid-hold — tests the release path without
  // taking a solving bot out of the game.
  const guest = connect(url);
  await once(guest, 'connect');
  guest.emit('player:join-room' as never, { roomCode, playerName: 'Gost' } as never);
  const guestId = (await once<{ player: { id: string } }>(guest, 'player:joined')).player.id;

  const controller: AnySocket = host ?? bots[0];
  const startErrors: string[] = [];
  controller.on('error' as never, ((e: { code: string; message: string }) => {
    startErrors.push(`${e.code}: ${e.message}`);
  }) as never);

  // --- otpremanje ---------------------------------------------------------------------
  controller.emit('host:start-game' as never, { gameId: 'puzla' } as never);
  await sleep(300);
  check(
    'start bez slike se odbija',
    startErrors.some((e) => e.startsWith('START_ERROR') && e.includes('sliku')),
    startErrors.join(' | ')
  );

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  check('PNG se odbija', !(await upload(controller, png)).ok);
  check('prevelika slika se odbija', !(await upload(controller, makeJpeg(1200, 900, 400_000))).ok);
  check('izdužena slika se odbija', !(await upload(controller, makeJpeg(1600, 400))).ok);
  if (!HOSTLESS) {
    const notMine = await upload(bots[0], makeJpeg(800, 600));
    check('igrač koji nije domaćin ne može da otpremi', !notMine.ok, JSON.stringify(notMine));
  }
  const good = await upload(controller, makeJpeg(1200, 900));
  check('ispravna slika prolazi', good.ok, JSON.stringify(good));
  const throttled = await upload(controller, makeJpeg(1200, 900));
  check(
    'drugo otpremanje odmah dobija grešku, ne tišinu',
    !throttled.ok && !throttled.error.startsWith('TIMEOUT'),
    JSON.stringify(throttled)
  );
  if (!good.ok) throw new Error('otpremanje nije uspelo, dalje nema smisla');
  check('url slike nosi id', good.url.endsWith(good.imageId));

  await sleep(600);
  controller.emit('host:start-game' as never, { gameId: 'puzla', puzlaImageId: 'pogresan' } as never);
  await sleep(300);
  check('start sa zastarelim id-jem se odbija', startErrors.some((e) => e.includes('zamenjena')));

  // --- praćenje stanja --------------------------------------------------------------
  let latest: PuzlaHostData | null = null;
  let phase = '';
  const seenPhases = new Set<string>();
  const heldNow = new Map<number, string>();
  let statesInSlaganje = 0;
  let framesSeen = 0;
  const events: { kind: string; playerId: string }[] = [];
  let lastEventSeq = 0;
  const stateWaiters: (() => void)[] = [];
  let ended = false;
  let endedPayload: { finalScores: { playerId: string; score: number }[]; awards?: unknown[] } | null = null;
  let firstState: GameStateLite | null = null;

  const watcher = bots[0];
  watcher.on('game:state-update' as never, ((d: { gameState: GameStateLite }) => {
    const gs = d.gameState;
    if (gs.data.host?.geo === undefined) return;
    firstState ??= gs;
    latest = gs.data.host;
    if (gs.phase !== phase) {
      phase = gs.phase;
      if (!seenPhases.has(phase)) {
        seenPhases.add(phase);
        console.log(`  faza: ${phase}`);
      }
    }
    if (gs.phase === 'slaganje') statesInSlaganje++;
    heldNow.clear();
    for (const [gid, pid] of Object.entries(gs.data.host.holders)) heldNow.set(Number(gid), pid);
    const ev = gs.data.host.lastEvent;
    if (ev && ev.seq > lastEventSeq) {
      lastEventSeq = ev.seq;
      events.push({ kind: ev.kind, playerId: ev.playerId });
    }
    for (const w of stateWaiters.splice(0)) w();
  }) as never);
  const frames: { at: number; frame: PuzlaFrame }[] = [];
  watcher.on('game:frame' as never, ((d: { gameId: string; frame: PuzlaFrame }) => {
    if (d.gameId !== 'puzla') return;
    framesSeen++;
    frames.push({ at: Date.now(), frame: d.frame });
    heldNow.clear();
    for (const [gid, , , , pid] of d.frame.held) heldNow.set(gid, pid);
  }) as never);
  watcher.on('game:ended' as never, ((d: typeof endedPayload) => {
    ended = true;
    endedPayload = d;
  }) as never);

  const nextState = (timeoutMs = 1500) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      stateWaiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });

  // host:start-game is throttled to one per 500ms per socket, silently.
  await sleep(600);
  controller.emit('host:start-game' as never, {
    gameId: 'puzla',
    puzlaImageId: good.imageId,
    puzlaPieces: PIECES,
    puzlaRotation: ROTATION,
    puzlaMode: RELAXED ? 'opusteno' : 'vreme',
  } as never);

  const deadlineStart = Date.now() + 15000;
  while (phase !== 'slaganje' && Date.now() < deadlineStart) await sleep(100);
  check('igra je krenula i prošao pregled', phase === 'slaganje', phase);
  if (phase !== 'slaganje') throw new Error(`nema slaganja — greške: ${startErrors.join(' | ')}`);

  const host0 = latest as unknown as PuzlaHostData;
  const geo = host0.geo;
  check('opušteno nema rok', RELAXED ? host0.timeLimitSec === null : (host0.timeLimitSec ?? 0) > 0);
  check('mid-game otpremanje se odbija', !(await upload(controller, makeJpeg(1000, 1000))).ok);

  const act = (sock: AnySocket, action: string, data: Record<string, unknown>) =>
    sock.emit('game:player-action' as never, { action, data } as never);

  const groupOf = (h: PuzlaHostData, gid: number) => h.groups.find((g) => g[0] === gid);
  const piecesOf = (h: PuzlaHostData, gid: number) =>
    h.pieceGroup.map((g, p) => (g === gid ? p : -1)).filter((p) => p >= 0);

  // --- vučenje: frame paketi, ne pun state -----------------------------------------
  {
    const h = latest as unknown as PuzlaHostData;
    const target = h.groups.find((g) => g[0] !== 0)!;
    const gid = target[0];
    const startX = target[1] / PUZLA_WIRE_SCALE;
    const startY = target[2] / PUZLA_WIRE_SCALE;
    const statesBefore = statesInSlaganje;
    const framesBefore = framesSeen;
    const t0 = Date.now();
    act(guest, 'puzla:grab', { groupId: gid });
    let sneakySeen = false;
    for (let i = 0; i < 30; i++) {
      await sleep(66);
      act(guest, 'puzla:move', { groupId: gid, x: startX + 0.002 * i, y: startY });
      if (PLAYERS >= 1 && i === 10) {
        // Someone else trying to take or shove a held piece must get nowhere.
        act(bots[0], 'puzla:grab', { groupId: gid });
        act(bots[0], 'puzla:move', { groupId: gid, x: 0.01, y: 0.01 });
      }
      const last = frames[frames.length - 1]?.frame.held.find((e) => e[0] === gid);
      if (last && last[4] !== guestId) sneakySeen = true;
      if (last && Math.abs(last[1] / PUZLA_WIRE_SCALE - 0.01) < 0.005) sneakySeen = true;
    }
    const spanSec = (Date.now() - t0) / 1000;
    const frameRate = (framesSeen - framesBefore) / spanSec;
    const stateRate = (statesInSlaganje - statesBefore) / spanSec;
    console.log(`  vučenje ${spanSec.toFixed(1)}s: ${frameRate.toFixed(1)} frame/s, ${stateRate.toFixed(2)} punih stanja/s`);
    check('frame paketi stižu (~15/s)', frameRate > 10 && frameRate < 20, frameRate.toFixed(1));
    check('vučenje ne šalje pun state', stateRate < 0.5, stateRate.toFixed(2));
    check('tuđi grab/move ne dira komadić koji neko drži', !sneakySeen);
    check('frame nosi držača', heldNow.get(gid) === guestId);

    // Holder's phone dies: the piece must come out of their hand almost at once.
    const t1 = Date.now();
    guest.disconnect();
    while (heldNow.has(gid) && Date.now() - t1 < 2000) await sleep(20);
    const releaseMs = Date.now() - t1;
    check('komadić ispada iz ruke igrača koji se odvezao', !heldNow.has(gid), `${releaseMs}ms`);
    check('otpuštanje je brzo', releaseMs < 400, `${releaseMs}ms`);
    console.log(`  odvezani držač pušten za ${releaseMs}ms`);
  }

  // --- zaključani komadić se ne može uzeti ------------------------------------------
  act(bots[0], 'puzla:grab', { groupId: FRAME_GROUP_ID });
  await sleep(200);
  check('ram (grupa 0) se ne može uzeti', !heldNow.has(FRAME_GROUP_ID));

  if (FULL) {
    const h = latest as unknown as PuzlaHostData;
    const g = h.groups.find((e) => e[0] !== 0 && !heldNow.has(e[0]))!;
    act(bots[0], 'puzla:grab', { groupId: g[0] });
    await sleep(300);
    check('grab radi', heldNow.get(g[0]) === ids[0]);
    const t = Date.now();
    while (heldNow.has(g[0]) && Date.now() - t < PUZLA_IDLE_RELEASE_MS + 3000) await sleep(100);
    const waited = Date.now() - t;
    check(
      'neaktivan komadić se sam spušta posle ~10s',
      !heldNow.has(g[0]) && waited > PUZLA_IDLE_RELEASE_MS - 1500,
      `${waited}ms`
    );
  }

  // --- slaganje ------------------------------------------------------------------------
  const drag = async (sock: AnySocket, myId: string, gid: number, tx: number, ty: number) => {
    const h = latest as unknown as PuzlaHostData;
    const g = groupOf(h, gid);
    if (!g) return false;
    act(sock, 'puzla:grab', { groupId: gid });
    await sleep(100);
    if (heldNow.get(gid) !== myId) return false; // someone beat us to it
    const sx = g[1] / PUZLA_WIRE_SCALE;
    const sy = g[2] / PUZLA_WIRE_SCALE;
    for (let i = 1; i <= 4; i++) {
      act(sock, 'puzla:move', { groupId: gid, x: sx + ((tx - sx) * i) / 4, y: sy + ((ty - sy) * i) / 4 });
      await sleep(66);
    }
    const waiting = nextState();
    act(sock, 'puzla:drop', { groupId: gid, x: tx, y: ty });
    await waiting;
    return true;
  };

  const uprightAndOrigin = async (sock: AnySocket, gid: number, wantRot: number) => {
    for (let guard = 0; guard < 4; guard++) {
      const h = latest as unknown as PuzlaHostData;
      const g = groupOf(h, gid);
      if (!g || g[3] === wantRot) return;
      const waiting = nextState();
      act(sock, 'puzla:rotate', { groupId: gid, piece: piecesOf(h, gid)[0] });
      await waiting;
    }
  };

  // One deliberate loose join first, so `spoj` (not only `ram`) is exercised.
  {
    const h = latest as unknown as PuzlaHostData;
    const gA = h.pieceGroup[0];
    const gB = h.pieceGroup[1];
    const a = groupOf(h, gA)!;
    if (ROTATION) await uprightAndOrigin(bots[0], gB, a[3]);
    const a2 = groupOf(latest as unknown as PuzlaHostData, gA)!;
    await drag(bots[0], ids[0], gB, a2[1] / PUZLA_WIRE_SCALE, a2[2] / PUZLA_WIRE_SCALE);
    check('slobodno spajanje je zabeleženo', events.some((e) => e.kind === 'spoj'), JSON.stringify(events));
  }

  const solveDeadline = Date.now() + 60_000 + PIECES * 1500;
  await Promise.all(
    bots.map(async (sock, i) => {
      const myId = ids[i];
      while (!ended && phase === 'slaganje' && Date.now() < solveDeadline) {
        const h = latest as unknown as PuzlaHostData;
        const lockedSet = new Set(piecesOf(h, FRAME_GROUP_ID));
        const candidates = h.groups
          .filter((g) => g[0] !== FRAME_GROUP_ID && !heldNow.has(g[0]))
          .filter((g) => {
            const ps = piecesOf(h, g[0]);
            return ps.some(
              (p) => puzlaIsBorderPiece(geo, p) || puzlaNeighbours(geo, p).some((q) => lockedSet.has(q))
            );
          });
        if (candidates.length === 0) {
          await sleep(80);
          continue;
        }
        const mine = candidates.filter((g) => g[0] % bots.length === i);
        const pick = (mine.length ? mine : candidates)[Math.floor(Math.random() * (mine.length || candidates.length))];
        if (ROTATION && pick[3] !== 0) {
          await uprightAndOrigin(sock, pick[0], 0);
          continue;
        }
        await drag(sock, myId, pick[0], geo.frameX, geo.frameY);
      }
    })
  );

  const deadlineEnd = Date.now() + 15000;
  while (!ended && Date.now() < deadlineEnd) await sleep(100);

  // --- provere ---------------------------------------------------------------------------
  const final = latest as unknown as PuzlaHostData;
  check('partija se završila', ended);
  check(
    'prošle su sve faze',
    ['pregled', 'slaganje', 'kraj'].every((p) => seenPhases.has(p)),
    [...seenPhases].join(', ')
  );
  check('slika je složena', final.lockedCount === final.total, `${final.lockedCount}/${final.total}`);
  check('rezultat kaže da je gotovo', final.result?.completed === true, JSON.stringify(final.result));
  check('bonus za završetak je isplaćen', (final.result?.bonus ?? 0) >= 100);
  check('bilo je zaključavanja u ram', events.some((e) => e.kind === 'ram'));
  check('završetak je pripisan', !!final.result?.finisherId);

  const scores = (endedPayload as { finalScores: { playerId: string; score: number }[] } | null)?.finalScores ?? [];
  const roomSize = PLAYERS + 1; // + gost
  check('konačni poeni za sve', scores.length === roomSize, `${scores.length}/${roomSize}`);
  const awards = (endedPayload as { awards?: unknown[] } | null)?.awards?.length ?? 0;
  const tied = scores.every((s) => s.score === scores[0]?.score);
  check('diplome', tied ? awards === 0 : awards === roomSize, tied ? `nerešeno, diploma ${awards}` : `${awards}/${roomSize}`);

  // Anti-leak doesn't apply (nothing secret), but the wire must stay compact:
  const bytes = JSON.stringify(firstState).length;
  console.log(`  pun state: ${(bytes / 1024).toFixed(1)} KB za ${final.total} komadića`);
  check('pun state je kompaktan', bytes < 12_000, `${bytes} B`);

  console.log('');
  if (failures.length === 0) {
    console.log('✅ sve provere prošle');
  } else {
    console.log(`❌ ${failures.length} provera nije prošla:`);
    for (const f of failures) console.log(`   · ${f}`);
  }

  host?.close();
  for (const b of bots) b.close();
  httpServer.close();
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
