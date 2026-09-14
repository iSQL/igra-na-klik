import { randomInt } from 'crypto';
import type {
  DiplomaCandidate,
  GameState,
  PuzlaEvent,
  PuzlaFrame,
  PuzlaGroupWire,
  PuzlaHostData,
  PuzlaMode,
  PuzlaPhase,
  PuzlaPlayerRef,
  PuzlaResult,
  Room,
} from '@igra/shared';
import {
  clampPuzlaMode,
  clampPuzlaPieces,
  puzlaBuildGeometry,
  puzlaClampOrigin,
  puzlaPieceCenter,
  puzlaRotate,
  puzlaScatter,
  puzlaTimeLimitSeconds,
  PUZLA_IDLE_RELEASE_MS,
  PUZLA_MAX_PLAYERS,
  PUZLA_POINTS_COMPLETE,
  PUZLA_POINTS_LOCK,
  PUZLA_POINTS_PER_PAIR,
  PUZLA_POINTS_TIME_MAX,
  PUZLA_TICK_MS,
  PUZLA_WIRE_SCALE,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import { puzlaImages, puzlaImageUrl } from './puzla-image-store.js';
import {
  FRAME_GROUP_ID,
  resolveDrop,
  type PuzlaBoard,
  type PuzlaGroup,
} from './snap.js';

/** Admin-tunable wait durations (seconds); the constants are the fallback. */
export const PREGLED_DURATION = 6;
export const KRAJ_DURATION = 12;

interface Hold {
  groupId: number;
  /** Module clock (ms) of the last grab or move — drives the idle release. */
  lastMoveAt: number;
}

interface PuzlaStats {
  pairs: number;
  locks: number;
}

interface PuzlaStartOptions {
  puzlaImageId?: unknown;
  puzlaPieces?: unknown;
  puzlaRotation?: unknown;
  puzlaMode?: unknown;
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Puzla — a collaborative jigsaw.
 *
 * Networking follows Splav's split, adapted to a table where most things stand
 * still:
 * - `grab` and `move` return null. Positions of held groups go out as
 *   `game:frame` snapshots built at TICK time from current positions — never
 *   captured when a move arrives, or a frame sent after a drop's full state
 *   would drag the piece back to where it was.
 * - `drop`, `rotate`, releases and phase changes return a full state, so the
 *   cached state a reconnecting phone is replayed never has a stale layout.
 * - The clock rides the platform's `game:timer`; `onTick` returns a state only
 *   when something structural changed.
 */
export class PuzlaModule extends BaseGameModule {
  readonly gameId = 'puzla';
  readonly tickIntervalMs = PUZLA_TICK_MS;

  private timings: Record<string, number> = {};
  private phase: PuzlaPhase = 'pregled';
  /** Seconds left in pregled / kraj. */
  private phaseRemaining = 0;
  private board!: PuzlaBoard;
  private total = 0;
  private imageUrl = '';
  private mode: PuzlaMode = 'vreme';
  private rotation = false;
  private timeLimitSec: number | null = null;
  private elapsedMs = 0;
  private clockMs = 0;
  private order: string[] = [];
  private holds = new Map<string, Hold>();
  private stats = new Map<string, PuzlaStats>();
  private zCounter = 0;
  private eventSeq = 0;
  private lastEvent: PuzlaEvent | undefined;
  private result: PuzlaResult | undefined;
  private frameSeq = 0;
  private pendingFrame: PuzlaFrame | null = null;
  /** A non-empty frame went out, so the next idle tick owes an empty one. */
  private framesLive = false;
  private dirty = false;

  validateStart(room: Room, customContent?: unknown): string | null {
    const connected = room.players.filter((p) => p.isConnected).length;
    if (connected > PUZLA_MAX_PLAYERS) {
      return `Puzla prima najviše ${PUZLA_MAX_PLAYERS} igrača.`;
    }
    const image = puzlaImages.get(room.code);
    if (!image) return 'Prvo izaberi sliku za slagalicu.';
    const cc = (customContent ?? {}) as PuzlaStartOptions;
    if (cc.puzlaImageId !== image.id) {
      return 'Slika je u međuvremenu zamenjena — izaberi igru ponovo.';
    }
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const cc = (customContent ?? {}) as PuzlaStartOptions;
    // validateStart guarantees it exists.
    const image = puzlaImages.get(room.code)!;

    const pieces = clampPuzlaPieces(cc.puzlaPieces);
    this.rotation = cc.puzlaRotation === true;
    this.mode = clampPuzlaMode(cc.puzlaMode);
    this.timeLimitSec =
      this.mode === 'vreme' ? puzlaTimeLimitSeconds(pieces, this.rotation) : null;
    this.imageUrl = puzlaImageUrl(room.code, image.id);

    const seed = randomInt(1, 2 ** 31 - 1);
    const geo = puzlaBuildGeometry(seed, pieces, image.width, image.height, this.rotation);
    this.total = geo.cols * geo.rows;

    const groups = new Map<number, PuzlaGroup>();
    groups.set(FRAME_GROUP_ID, {
      id: FRAME_GROUP_ID,
      x: geo.frameX,
      y: geo.frameY,
      rot: 0,
      z: 0,
      pieces: [],
    });
    const pieceGroup = new Array<number>(this.total);
    for (const s of puzlaScatter(geo, this.rotation)) {
      const id = s.piece + 1;
      groups.set(id, { id, x: s.x, y: s.y, rot: s.rot, z: ++this.zCounter, pieces: [s.piece] });
      pieceGroup[s.piece] = id;
    }
    this.board = { geo, groups, pieceGroup };

    this.order = room.players.filter((p) => p.isConnected).map((p) => p.id);
    for (const id of this.order) this.stats.set(id, { pairs: 0, locks: 0 });

    this.phase = 'pregled';
    this.phaseRemaining = this.timings.PREGLED_DURATION ?? PREGLED_DURATION;
    return this.buildGameState(room);
  }

  // --- Input ---------------------------------------------------------------

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.phase !== 'slaganje') return null;
    if (!room.players.some((p) => p.id === playerId)) return null;

    const groupId = finite(data?.groupId);
    const group = groupId === null ? undefined : this.board.groups.get(groupId);
    if (!group || group.id === FRAME_GROUP_ID) return null;

    switch (action) {
      case 'puzla:grab':
        return this.grab(room, playerId, group);
      case 'puzla:move':
        this.move(playerId, group, data);
        return null;
      case 'puzla:drop':
        return this.drop(room, playerId, group, data);
      case 'puzla:rotate':
        return this.rotate(room, playerId, group, data);
    }
    return null;
  }

  private holderOf(groupId: number): string | null {
    for (const [pid, hold] of this.holds) {
      if (hold.groupId === groupId) return pid;
    }
    return null;
  }

  private grab(room: Room, playerId: string, group: PuzlaGroup): GameState | null {
    const holder = this.holderOf(group.id);
    if (holder && holder !== playerId) return null;

    // One hold per player — picking up a second piece puts the first down
    // where it lies, without snapping (nobody aimed it).
    const previous = this.holds.get(playerId);
    const releasedOther = !!previous && previous.groupId !== group.id;

    this.holds.set(playerId, { groupId: group.id, lastMoveAt: this.clockMs });
    group.z = ++this.zCounter;
    // The holder appears in the next frame (≤66ms); the phone is optimistic.
    if (releasedOther) return this.buildGameState(room);
    return null;
  }

  private move(playerId: string, group: PuzlaGroup, data: Record<string, unknown>): void {
    const hold = this.holds.get(playerId);
    if (!hold || hold.groupId !== group.id) return;
    const x = finite(data.x);
    const y = finite(data.y);
    if (x === null || y === null) return;
    const clamped = puzlaClampOrigin(this.board.geo, x, y, group.rot, group.pieces);
    group.x = clamped.x;
    group.y = clamped.y;
    hold.lastMoveAt = this.clockMs;
  }

  private drop(
    room: Room,
    playerId: string,
    group: PuzlaGroup,
    data: Record<string, unknown>
  ): GameState | null {
    const hold = this.holds.get(playerId);
    // Idempotent: a retried drop that already landed finds no hold.
    if (!hold || hold.groupId !== group.id) return null;
    this.move(playerId, group, data);
    this.holds.delete(playerId);
    this.settle(room, playerId, group);
    return this.buildGameState(room);
  }

  private rotate(
    room: Room,
    playerId: string,
    group: PuzlaGroup,
    data: Record<string, unknown>
  ): GameState | null {
    if (!this.rotation) return null;
    const holder = this.holderOf(group.id);
    if (holder && holder !== playerId) return null;

    // Turn about the tapped piece so it stays under the finger.
    const tapped = finite(data.piece);
    const pivot = tapped !== null && group.pieces.includes(tapped) ? tapped : group.pieces[0];
    const geo = this.board.geo;
    const centre = puzlaPieceCenter(geo, group.x, group.y, group.rot, pivot);
    const rot = (group.rot + 1) % 4;
    const c = pivot % geo.cols;
    const r = Math.floor(pivot / geo.cols);
    const v = puzlaRotate((c + 0.5) * geo.pw, (r + 0.5) * geo.ph, rot);
    const clamped = puzlaClampOrigin(geo, centre.x - v.x, centre.y - v.y, rot, group.pieces);
    group.rot = rot;
    group.x = clamped.x;
    group.y = clamped.y;
    group.z = ++this.zCounter;

    // Turning a piece the right way up next to its neighbour is a join too.
    if (!holder) this.settle(room, playerId, group);
    return this.buildGameState(room);
  }

  /** Snap a group where it lies, credit whoever put it there, check for the finish. */
  private settle(room: Room, playerId: string, group: PuzlaGroup): void {
    const geo = this.board.geo;
    const markPiece = group.pieces[0];
    const res = resolveDrop(this.board, group.id, (gid) => {
      const holder = this.holderOf(gid);
      return holder !== null && holder !== playerId;
    });
    if (res.merges === 0) return;

    const points = res.pairs * PUZLA_POINTS_PER_PAIR + (res.locked ? PUZLA_POINTS_LOCK : 0);
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.score += points;
    const stats = this.statsFor(playerId);
    stats.pairs += res.pairs;
    if (res.locked) stats.locks += 1;

    const into = this.board.groups.get(res.groupId)!;
    const at = puzlaPieceCenter(geo, into.x, into.y, into.rot, markPiece);
    this.lastEvent = {
      seq: ++this.eventSeq,
      playerId,
      kind: res.locked ? 'ram' : 'spoj',
      pairs: res.pairs,
      points,
      x: at.x,
      y: at.y,
    };

    const frame = this.board.groups.get(FRAME_GROUP_ID)!;
    if (frame.pieces.length === this.total) this.finish(room, playerId);
  }

  // --- Loop ----------------------------------------------------------------

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.phase === 'ended') return null;
    this.clockMs += deltaMs;

    if (this.phase === 'pregled') {
      this.phaseRemaining -= deltaMs / 1000;
      if (this.phaseRemaining <= 0) {
        this.phase = 'slaganje';
        this.dirty = true;
      }
    } else if (this.phase === 'slaganje') {
      this.elapsedMs += deltaMs;
      this.releaseStaleHolds(room);
      if (this.timeLimitSec !== null && this.elapsedMs / 1000 >= this.timeLimitSec) {
        this.finish(room, null);
      }
      this.queueFrame();
    } else if (this.phase === 'kraj') {
      // A drop that finished the picture cleared every hold outside the tick —
      // owe the room one empty frame so nothing stays "in someone's hand".
      this.queueFrame();
      this.phaseRemaining -= deltaMs / 1000;
      if (this.phaseRemaining <= 0) {
        this.phase = 'ended';
        this.dirty = true;
      }
    }

    if (!this.dirty) return null;
    this.dirty = false;
    return this.buildGameState(room);
  }

  getPendingFrame(): PuzlaFrame | null {
    const frame = this.pendingFrame;
    this.pendingFrame = null;
    return frame;
  }

  /**
   * Released without a snap or a point: a phone that went to sleep, a player
   * who left, or a piece held and forgotten. (`onPlayerDisconnect` only fires
   * after the 5-minute grace, far too late for a piece in someone's hand.)
   */
  private releaseStaleHolds(room: Room): void {
    for (const [pid, hold] of this.holds) {
      const player = room.players.find((p) => p.id === pid);
      const stale =
        !player ||
        !player.isConnected ||
        !this.board.groups.has(hold.groupId) ||
        this.clockMs - hold.lastMoveAt > PUZLA_IDLE_RELEASE_MS;
      if (stale) {
        this.holds.delete(pid);
        this.dirty = true;
      }
    }
  }

  /** Built from where the groups ARE now, never from a queued move. */
  private queueFrame(): void {
    if (this.holds.size === 0) {
      if (this.framesLive) {
        this.pendingFrame = { seq: ++this.frameSeq, held: [] };
        this.framesLive = false;
      }
      return;
    }
    const held: PuzlaFrame['held'] = [];
    for (const [pid, hold] of this.holds) {
      const g = this.board.groups.get(hold.groupId);
      if (!g) continue;
      held.push([
        g.id,
        Math.round(g.x * PUZLA_WIRE_SCALE),
        Math.round(g.y * PUZLA_WIRE_SCALE),
        g.rot,
        pid,
      ]);
    }
    this.pendingFrame = { seq: ++this.frameSeq, held };
    this.framesLive = true;
  }

  private finish(room: Room, finisherId: string | null): void {
    if (this.phase !== 'slaganje') return;
    const completed =
      this.board.groups.get(FRAME_GROUP_ID)!.pieces.length === this.total;
    const elapsedSec = Math.floor(this.elapsedMs / 1000);

    let bonus = 0;
    if (completed) {
      bonus = PUZLA_POINTS_COMPLETE;
      if (this.timeLimitSec !== null) {
        const left = Math.max(0, this.timeLimitSec - this.elapsedMs / 1000);
        bonus += Math.round((PUZLA_POINTS_TIME_MAX * left) / this.timeLimitSec);
      }
      for (const p of room.players) {
        if (this.order.includes(p.id)) p.score += bonus;
      }
    }

    this.holds.clear();
    this.result = { completed, elapsedSec, bonus, finisherId };
    this.phase = 'kraj';
    this.phaseRemaining = this.timings.KRAJ_DURATION ?? KRAJ_DURATION;
    this.dirty = true;
  }

  // --- Disconnects ---------------------------------------------------------

  onPlayerDisconnect(room: Room, _gameState: GameState, playerId: string): GameState | null {
    // Past the grace period — the seat is gone. The pieces they joined stay
    // joined; only their hand empties.
    this.holds.delete(playerId);
    const idx = this.order.indexOf(playerId);
    if (idx !== -1) this.order.splice(idx, 1);
    if (this.order.length === 0 && this.phase !== 'ended') {
      this.phase = 'ended';
    }
    return this.buildGameState(room);
  }

  // --- Diplomas ------------------------------------------------------------

  getAwardCandidates(room: Room): DiplomaCandidate[] {
    const candidates: DiplomaCandidate[] = [];
    const entries = [...this.stats.entries()]
      .filter(([id]) => room.players.some((p) => p.id === id))
      .map(([id, s]) => ({ id, s }));
    if (entries.length === 0) return candidates;

    const best = (value: (s: PuzlaStats) => number, minimum: number) => {
      const top = entries.reduce((a, b) => (value(b.s) > value(a.s) ? b : a));
      return value(top.s) >= minimum ? top : null;
    };

    const spajalica = best((s) => s.pairs, 4);
    if (spajalica) {
      candidates.push({
        playerId: spajalica.id,
        awardId: 'spajalica',
        priority: 70,
        subtitle: `${spajalica.s.pairs} spojenih ivica`,
      });
    }
    const ramar = best((s) => s.locks, 2);
    if (ramar) {
      candidates.push({
        playerId: ramar.id,
        awardId: 'ramar',
        priority: 62,
        subtitle: `${ramar.s.locks} puta uglavio u ram`,
      });
    }
    const finisher = this.result?.completed ? this.result.finisherId : null;
    if (finisher && room.players.some((p) => p.id === finisher)) {
      candidates.push({ playerId: finisher, awardId: 'zavrsni-potez', priority: 58 });
    }
    return candidates;
  }

  // --- Build state ---------------------------------------------------------

  private statsFor(playerId: string): PuzlaStats {
    let s = this.stats.get(playerId);
    if (!s) {
      s = { pairs: 0, locks: 0 };
      this.stats.set(playerId, s);
    }
    return s;
  }

  private playerRef(room: Room, playerId: string): PuzlaPlayerRef {
    const p = room.players.find((pl) => pl.id === playerId);
    return {
      playerId,
      name: p?.name ?? '?',
      avatarColor: p?.avatarColor ?? '#888888',
      avatarEmoji: p?.avatarEmoji ?? '👤',
    };
  }

  private buildGameState(room: Room): GameState {
    const groups: PuzlaGroupWire[] = [];
    for (const g of this.board.groups.values()) {
      groups.push([
        g.id,
        Math.round(g.x * PUZLA_WIRE_SCALE),
        Math.round(g.y * PUZLA_WIRE_SCALE),
        g.rot,
        g.z,
      ]);
    }
    const holders: Record<string, string> = {};
    for (const [pid, hold] of this.holds) holders[String(hold.groupId)] = pid;

    const hostData: PuzlaHostData = {
      imageUrl: this.imageUrl,
      geo: this.board.geo,
      mode: this.mode,
      rotation: this.rotation,
      groups,
      // Copied: the cached state is what a reconnecting phone gets replayed,
      // and a live array would drift ahead of the `groups` snapshot beside it.
      pieceGroup: [...this.board.pieceGroup],
      holders,
      roster: this.order.map((id) => {
        const s = this.stats.get(id);
        return {
          ...this.playerRef(room, id),
          score: room.players.find((p) => p.id === id)?.score ?? 0,
          pairs: s?.pairs ?? 0,
          locks: s?.locks ?? 0,
        };
      }),
      lockedCount: this.board.groups.get(FRAME_GROUP_ID)!.pieces.length,
      total: this.total,
      timeLimitSec: this.timeLimitSec,
      elapsedSec: Math.floor(this.elapsedMs / 1000),
    };
    if (this.lastEvent) hostData.lastEvent = this.lastEvent;
    if (this.result) hostData.result = this.result;

    let timeRemaining = 0;
    if (this.phase === 'slaganje') {
      timeRemaining =
        this.timeLimitSec === null
          ? 0
          : Math.max(0, Math.ceil(this.timeLimitSec - this.elapsedMs / 1000));
    } else if (this.phase === 'pregled' || this.phase === 'kraj') {
      timeRemaining = Math.max(0, Math.ceil(this.phaseRemaining));
    }

    return {
      gameId: this.gameId,
      phase: this.phase,
      round: 1,
      totalRounds: 1,
      timeRemaining,
      data: { phase: this.phase, host: hostData },
      playerData: {},
    };
  }
}
