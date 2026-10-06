import type {
  BedemFrame,
  BedemFrameIncoming,
  BedemHostData,
  BedemControllerData,
  BedemPlayerRef,
  BedemResultEntry,
  BedemSendType,
  BedemTowerType,
  DiplomaCandidate,
  GameFlowCollection,
  GameState,
  Room,
} from '@igra/shared';
import {
  BEDEM_BUILD_S,
  BEDEM_ENDLESS_CAP,
  BEDEM_FIRST_BUILD_S,
  BEDEM_FRAME_INTERVAL_MS,
  BEDEM_LIVES,
  BEDEM_MAX_PLAYERS,
  BEDEM_MIN_PLAYERS,
  BEDEM_PLACE_POINTS,
  BEDEM_SEND_CAP,
  BEDEM_SEND_DELAY_MS,
  BEDEM_SENDS,
  BEDEM_START_GOLD,
  BEDEM_TICK_MS,
  BEDEM_TOWERS,
  BEDEM_WAVE_POINTS,
  BEDEM_WAVES,
  BEDEM_WIN_POINTS,
  bedemBuildable,
  bedemHpScale,
  bedemLayoutsFor,
  bedemPathCells,
  bedemPathLength,
  bedemSellValue,
  bedemTeamHpScale,
  bedemUpgradeCost,
  bedemWave,
  bedemWaveHasBoss,
  bedemWaveIncome,
  clampBedemLength,
  clampBedemMode,
  shuffled,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import {
  createMap,
  enqueue,
  mapClear,
  stepMap,
  type SimMap,
  type StepResult,
} from './sim.js';
import {
  KRAJ_DURATION,
  UVOD_DURATION,
  emptyStats,
  type BedemInternalState,
  type BedemStats,
} from './BedemState.js';

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Gap between two sent units walking in, so a batch reads as a batch. */
const SEND_SPACING_MS = 350;
/** Points to the sender per life their units take off an opponent. */
const LEAK_CREDIT_POINTS = 5;

/**
 * Bedem — tower defense with the whole map on every phone.
 *
 * Same wire design as Splav: a 50ms fast tick, enemy positions published as
 * `game:frame` snapshots (~10/s), and a full GameState only when something
 * structural changes — a phase, a tower built or sold, a gate falling. Gold
 * and lives move on every kill, so during a wave they ride the frame too.
 *
 * Unlike Splav, building actions DO return a full state: they're a handful
 * per minute, and every phone must see the new tower right away.
 */
export class BedemModule extends BaseGameModule {
  readonly gameId = 'bedem';
  readonly tickIntervalMs = BEDEM_TICK_MS;

  private state!: BedemInternalState;
  private timings: Record<string, number> = {};

  validateStart(room: Room, customContent?: unknown): string | null {
    const connected = room.players.filter((p) => p.isConnected).length;
    const mode = clampBedemMode((customContent as { bedemMode?: unknown } | undefined)?.bedemMode);
    if (mode === 'protiv' && connected < BEDEM_MIN_PLAYERS) {
      return 'Za režim Protiv trebaju bar 2 igrača.';
    }
    if (connected > BEDEM_MAX_PLAYERS) return `Bedem prima najviše ${BEDEM_MAX_PLAYERS} igrača.`;
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const content = (customContent ?? {}) as { bedemMode?: unknown; bedemLength?: unknown };
    const mode = clampBedemMode(content.bedemMode);
    const length = clampBedemLength(content.bedemLength);
    const order = shuffled(room.players.filter((p) => p.isConnected).map((p) => p.id));

    const layouts = bedemLayoutsFor(mode, order.length);
    const layout = layouts[Math.floor(Math.random() * layouts.length)];
    const pathLength = bedemPathLength(layout.path);

    const maps: SimMap[] =
      mode === 'zajedno'
        ? [createMap(null, BEDEM_LIVES, layout.path, pathLength)]
        : order.map((id) => createMap(id, BEDEM_LIVES, layout.path, pathLength));
    const mapOf = new Map(order.map((id, i) => [id, mode === 'zajedno' ? 0 : i]));

    this.state = {
      phase: 'uvod',
      phaseTimeRemaining: this.timings.UVOD_DURATION ?? UVOD_DURATION,
      mode,
      length,
      totalWaves: BEDEM_WAVES[length],
      wave: 1,
      layout,
      pathCells: bedemPathCells(layout.path),
      pathLength,
      maps,
      order,
      mapOf,
      gold: new Map(order.map((id) => [id, BEDEM_START_GOLD])),
      bonusIncome: new Map(),
      sendsThisWave: new Map(),
      stats: new Map(order.map((id) => [id, emptyStats()])),
      ready: new Set(),
      expectedReady: new Set(),
      fallen: [],
      nextTowerId: 1,
      frameSeq: 0,
      frameAccumMs: 0,
      shotBuffer: maps.map(() => []),
      leakBuffer: maps.map(() => 0),
      pendingFrame: null,
      dirty: false,
      lastSecond: -1,
    };
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
    const s = this.state;
    if (s.phase !== 'gradnja' && s.phase !== 'talas') return null;
    if (!s.order.includes(playerId)) return null;

    switch (action) {
      case 'bedem:build':
        return this.build(playerId, data.c, data.r, data.tower) ? this.buildGameState(room) : null;
      case 'bedem:upgrade':
        return this.upgrade(playerId, data.towerId) ? this.buildGameState(room) : null;
      case 'bedem:sell':
        return this.sell(playerId, data.towerId) ? this.buildGameState(room) : null;
      case 'bedem:send':
        return this.send(playerId, data.unit, data.targetId) ? this.buildGameState(room) : null;
      case 'bedem:ready':
        if (s.phase !== 'gradnja' || s.ready.has(playerId)) return null;
        s.ready.add(playerId);
        if (this.allReady(room)) this.startWave();
        return this.buildGameState(room);
    }
    return null;
  }

  private myMap(playerId: string): SimMap | null {
    const idx = this.state.mapOf.get(playerId);
    const map = idx === undefined ? null : this.state.maps[idx];
    return map && map.alive ? map : null;
  }

  private spend(playerId: string, cost: number): boolean {
    const gold = this.state.gold.get(playerId) ?? 0;
    if (gold < cost) return false;
    this.state.gold.set(playerId, gold - cost);
    return true;
  }

  private build(playerId: string, rawC: unknown, rawR: unknown, rawType: unknown): boolean {
    const s = this.state;
    const map = this.myMap(playerId);
    if (!map) return false;
    if (typeof rawType !== 'string' || !(rawType in BEDEM_TOWERS)) return false;
    const type = rawType as BedemTowerType;
    const c = Number(rawC);
    const r = Number(rawR);
    if (!bedemBuildable(s.layout, s.pathCells, c, r)) return false;
    if (map.towers.some((t) => t.c === c && t.r === r)) return false;
    const cost = BEDEM_TOWERS[type].levels[0].cost;
    if (!this.spend(playerId, cost)) return false;
    map.towers.push({
      id: s.nextTowerId++,
      c,
      r,
      type,
      level: 1,
      ownerId: playerId,
      spent: cost,
      readyAt: map.time,
    });
    this.statsFor(playerId).built += 1;
    return true;
  }

  private ownTower(playerId: string, rawId: unknown) {
    const map = this.myMap(playerId);
    const id = Number(rawId);
    const tower = map?.towers.find((t) => t.id === id && t.ownerId === playerId);
    return map && tower ? { map, tower } : null;
  }

  private upgrade(playerId: string, rawId: unknown): boolean {
    const found = this.ownTower(playerId, rawId);
    if (!found) return false;
    const cost = bedemUpgradeCost(found.tower.type, found.tower.level);
    if (cost === null || !this.spend(playerId, cost)) return false;
    found.tower.level += 1;
    found.tower.spent += cost;
    return true;
  }

  private sell(playerId: string, rawId: unknown): boolean {
    const found = this.ownTower(playerId, rawId);
    if (!found) return false;
    found.map.towers = found.map.towers.filter((t) => t !== found.tower);
    this.state.gold.set(playerId, (this.state.gold.get(playerId) ?? 0) + bedemSellValue(found.tower.spent));
    return true;
  }

  private send(playerId: string, rawUnit: unknown, rawTarget: unknown): boolean {
    const s = this.state;
    if (s.mode !== 'protiv' || s.phase !== 'talas') return false;
    if (typeof rawUnit !== 'string' || !(rawUnit in BEDEM_SENDS)) return false;
    if (!this.myMap(playerId)) return false;
    const sent = s.sendsThisWave.get(playerId) ?? 0;
    if (sent >= BEDEM_SEND_CAP) return false;

    const targetId = this.sendTarget(playerId, rawTarget);
    if (!targetId) return false;
    const target = this.myMap(targetId);
    if (!target) return false;

    const def = BEDEM_SENDS[rawUnit as BedemSendType];
    if (!this.spend(playerId, def.cost)) return false;
    s.sendsThisWave.set(playerId, sent + 1);
    s.bonusIncome.set(playerId, (s.bonusIncome.get(playerId) ?? 0) + def.income);
    this.statsFor(playerId).sent += def.count;

    const hpScale = bedemHpScale(s.wave);
    for (let k = 0; k < def.count; k++) {
      enqueue(target, {
        type: def.enemy,
        at: target.time + BEDEM_SEND_DELAY_MS + k * SEND_SPACING_MS,
        hpScale,
        sentBy: playerId,
      });
    }
    return true;
  }

  /** The chosen opponent if still standing, otherwise the next one in seating order. */
  private sendTarget(playerId: string, rawTarget: unknown): string | null {
    const s = this.state;
    if (typeof rawTarget === 'string' && rawTarget !== playerId && this.myMap(rawTarget)) {
      return rawTarget;
    }
    const at = s.order.indexOf(playerId);
    for (let k = 1; k < s.order.length; k++) {
      const id = s.order[(at + k) % s.order.length];
      if (this.myMap(id)) return id;
    }
    return null;
  }

  // --- Loop ----------------------------------------------------------------

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    const s = this.state;
    if (s.phase === 'ended') return null;

    if (s.phase === 'talas') {
      this.simulate(room, deltaMs);
    } else {
      s.phaseTimeRemaining -= deltaMs / 1000;
      if (s.phaseTimeRemaining <= 0) this.advancePhase(room);
    }

    const sec = Math.max(0, Math.ceil(s.phaseTimeRemaining));
    if (s.dirty || sec !== s.lastSecond) {
      s.dirty = false;
      s.lastSecond = sec;
      return this.buildGameState(room);
    }
    return null;
  }

  getPendingFrame(): BedemFrame | null {
    const frame = (this.state?.pendingFrame ?? null) as BedemFrame | null;
    if (frame) this.state.pendingFrame = null;
    return frame;
  }

  private simulate(room: Room, deltaMs: number): void {
    const s = this.state;
    s.maps.forEach((map, i) => {
      if (!map.alive) return;
      const res = stepMap(map, deltaMs);
      this.applyStep(room, map, i, res);
    });

    s.frameAccumMs += deltaMs;
    if (s.frameAccumMs >= BEDEM_FRAME_INTERVAL_MS) {
      s.frameAccumMs %= BEDEM_FRAME_INTERVAL_MS;
      s.pendingFrame = this.buildFrame();
    }

    if (s.phase !== 'talas') return;
    if (s.maps.every((m) => !m.alive || mapClear(m))) this.finishWave(room);
  }

  private applyStep(room: Room, map: SimMap, index: number, res: StepResult): void {
    const s = this.state;
    for (const kill of res.kills) {
      s.gold.set(kill.towerOwnerId, (s.gold.get(kill.towerOwnerId) ?? 0) + kill.bounty);
      this.addScore(room, kill.towerOwnerId, kill.bounty);
      const stats = this.statsFor(kill.towerOwnerId);
      stats.kills += 1;
      if (kill.type === 'azdaja') stats.bossKills += 1;
    }
    for (const [owner, dmg] of res.damage) this.statsFor(owner).damage += dmg;
    for (const leak of res.leaks) {
      if (leak.sentBy) this.addScore(room, leak.sentBy, leak.lives * LEAK_CREDIT_POINTS);
      s.leakBuffer[index] += leak.lives;
    }
    if (res.shots.length > 0) s.shotBuffer[index].push(...res.shots);

    if (!map.alive) {
      s.dirty = true;
      // One last frame so every screen sees the gate at zero.
      s.pendingFrame = this.buildFrame();
      if (s.mode === 'zajedno') {
        this.finishGame(room, false);
      } else if (map.ownerId) {
        s.fallen.push(map.ownerId);
        if (s.maps.filter((m) => m.alive).length <= 1) this.finishGame(room, false);
      }
    }
  }

  private buildFrame(): BedemFrame {
    const s = this.state;
    const g: Record<string, number> = {};
    for (const id of s.order) g[id] = s.gold.get(id) ?? 0;
    return {
      seq: ++s.frameSeq,
      g,
      maps: s.maps.map((map, i) => {
        const shots = s.shotBuffer[i];
        const leaks = s.leakBuffer[i];
        s.shotBuffer[i] = [];
        s.leakBuffer[i] = 0;
        const frameMap: BedemFrame['maps'][number] = {
          o: map.ownerId,
          l: map.lives,
          e: map.enemies.map((e) => ({
            i: e.id,
            t: e.type,
            d: r2(e.dist),
            h: Math.max(1, Math.round((e.hp / e.maxHp) * 100)),
            s: map.time < e.slowUntil,
          })),
          s: shots,
          x: leaks,
        };
        if (s.mode === 'protiv') {
          const incoming: BedemFrameIncoming[] = [];
          for (const q of map.queue) {
            if (!q.sentBy) continue;
            incoming.push({ u: q.type as BedemSendType, f: q.sentBy, ms: Math.round(q.at - map.time) });
            if (incoming.length >= 12) break;
          }
          if (incoming.length > 0) frameMap.p = incoming;
        }
        return frameMap;
      }),
    };
  }

  // --- Flow ----------------------------------------------------------------

  private advancePhase(room: Room): void {
    const s = this.state;
    if (s.phase === 'uvod') {
      this.enterBuild(BEDEM_FIRST_BUILD_S);
    } else if (s.phase === 'gradnja') {
      this.startWave();
    } else if (s.phase === 'kraj') {
      s.phase = 'ended';
      s.phaseTimeRemaining = 0;
    }
    s.dirty = true;
  }

  private enterBuild(seconds: number): void {
    const s = this.state;
    s.phase = 'gradnja';
    s.phaseTimeRemaining = seconds;
    s.ready = new Set();
    s.expectedReady = new Set(s.order.filter((id) => this.myMap(id)));
    s.dirty = true;
  }

  private allReady(room: Room): boolean {
    for (const id of this.state.expectedReady) {
      if (this.state.ready.has(id)) continue;
      if (!room.players.some((p) => p.id === id)) continue;
      return false;
    }
    return true;
  }

  private startWave(): void {
    const s = this.state;
    const players = s.mode === 'zajedno' ? s.order.length : 1;
    const hpScale = bedemHpScale(s.wave) * (s.mode === 'zajedno' ? bedemTeamHpScale(players) : 1);
    const groups = bedemWave(s.wave, players);

    for (const map of s.maps) {
      if (!map.alive) continue;
      map.time = 0;
      map.enemies = [];
      map.queue = [];
      for (const t of map.towers) t.readyAt = 0;
      let start = 0;
      for (const g of groups) {
        start += g.afterMs;
        for (let k = 0; k < g.count; k++) {
          enqueue(map, { type: g.enemy, at: start + k * g.gapMs, hpScale, sentBy: null });
        }
      }
    }
    s.sendsThisWave = new Map();
    s.shotBuffer = s.maps.map(() => []);
    s.leakBuffer = s.maps.map(() => 0);
    s.frameAccumMs = 0;
    s.phase = 'talas';
    s.phaseTimeRemaining = 0;
    s.dirty = true;
  }

  private finishWave(room: Room): void {
    const s = this.state;
    for (const id of s.order) {
      if (!this.myMap(id)) continue;
      this.statsFor(id).waves += 1;
      this.addScore(room, id, BEDEM_WAVE_POINTS);
    }
    // A last frame with the map empty, so no enemy freezes mid-path on screen.
    s.pendingFrame = this.buildFrame();

    const lastWave = s.totalWaves !== null ? s.wave >= s.totalWaves : s.wave >= BEDEM_ENDLESS_CAP;
    if (lastWave) {
      this.finishGame(room, s.mode === 'zajedno' && s.totalWaves !== null);
      return;
    }

    s.wave += 1;
    for (const id of s.order) {
      if (!this.myMap(id)) continue;
      const pay = bedemWaveIncome(s.wave) + (s.bonusIncome.get(id) ?? 0);
      s.gold.set(id, (s.gold.get(id) ?? 0) + pay);
    }
    this.enterBuild(BEDEM_BUILD_S);
  }

  private finishGame(room: Room, won: boolean): void {
    const s = this.state;
    if (s.phase === 'kraj' || s.phase === 'ended') return;

    let ranked: string[];
    if (s.mode === 'protiv') {
      const standing = s.order
        .filter((id) => this.myMap(id))
        .sort(
          (a, b) =>
            (this.myMap(b)?.lives ?? 0) - (this.myMap(a)?.lives ?? 0) ||
            this.scoreOf(room, b) - this.scoreOf(room, a)
        );
      ranked = [...standing, ...[...s.fallen].reverse()].filter((id) => s.order.includes(id));
      ranked.forEach((id, i) => {
        this.statsFor(id).place = i + 1;
        this.addScore(room, id, BEDEM_PLACE_POINTS[i] ?? 0);
      });
    } else {
      if (won) for (const id of s.order) this.addScore(room, id, BEDEM_WIN_POINTS);
      ranked = [...s.order].sort((a, b) => this.scoreOf(room, b) - this.scoreOf(room, a));
    }

    const entries: BedemResultEntry[] = ranked.map((id, i) => {
      const stats = this.statsFor(id);
      return {
        ...this.playerRef(room, id),
        rank: i + 1,
        score: this.scoreOf(room, id),
        kills: stats.kills,
        waves: stats.waves,
      };
    });
    const top = ranked[0] ? this.statsFor(ranked[0]).waves : 0;
    s.result = {
      won,
      wavesSurvived: s.mode === 'zajedno' ? Math.max(0, ...s.order.map((id) => this.statsFor(id).waves)) : top,
      entries,
    };
    for (const map of s.maps) {
      map.enemies = [];
      map.queue = [];
    }
    s.phase = 'kraj';
    s.phaseTimeRemaining = this.timings.KRAJ_DURATION ?? KRAJ_DURATION;
    s.dirty = true;
  }

  getFlowInfo(
    _room: Room,
    _gameState: GameState
  ): { collection: GameFlowCollection | null; skipLabel: string | null } {
    const s = this.state;
    if (s.phase === 'gradnja') {
      const expectedIds = [...s.expectedReady];
      const doneIds = expectedIds.filter((id) => s.ready.has(id));
      return {
        collection: { expectedIds, doneIds, doneCount: doneIds.length, verb: 'acted' },
        skipLabel: 'Pokreni talas',
      };
    }
    return { collection: null, skipLabel: null };
  }

  onHostSkip(room: Room, _gameState: GameState): GameState | null {
    if (this.state.phase !== 'gradnja') return null;
    this.startWave();
    return this.buildGameState(room);
  }

  onStopWaiting(room: Room, _gameState: GameState, playerId: string): GameState | null {
    const s = this.state;
    if (s.phase !== 'gradnja' || !s.expectedReady.delete(playerId)) return null;
    if (this.allReady(room)) this.startWave();
    return this.buildGameState(room);
  }

  // --- Disconnects ---------------------------------------------------------

  onPlayerDisconnect(room: Room, _gameState: GameState, playerId: string): GameState | null {
    // Fired only after the reconnect grace expired — the seat is really gone.
    const s = this.state;
    const idx = s.order.indexOf(playerId);
    if (idx === -1) return null;

    if (s.mode === 'protiv') {
      const map = this.myMap(playerId);
      if (map && s.phase !== 'kraj' && s.phase !== 'ended') {
        map.alive = false;
        map.enemies = [];
        map.queue = [];
        s.fallen.push(playerId);
      }
    }
    // In 'zajedno' the towers stay: they were built for the team.
    s.order.splice(idx, 1);
    s.expectedReady.delete(playerId);

    if (s.order.length === 0) {
      s.phase = 'ended';
      s.phaseTimeRemaining = 0;
      return this.buildGameState(room);
    }
    if (s.mode === 'protiv' && s.phase !== 'kraj' && s.maps.filter((m) => m.alive).length <= 1) {
      this.finishGame(room, false);
    } else if (s.phase === 'gradnja' && this.allReady(room)) {
      this.startWave();
    }
    return this.buildGameState(room);
  }

  // --- Diplomas ------------------------------------------------------------

  getAwardCandidates(room: Room): DiplomaCandidate[] {
    const candidates: DiplomaCandidate[] = [];
    const entries = [...this.state.stats.entries()]
      .filter(([id]) => room.players.some((p) => p.id === id))
      .map(([id, s]) => ({ id, s }));
    if (entries.length === 0) return candidates;

    const best = (value: (s: BedemStats) => number, minimum: number) => {
      const top = entries.reduce((a, b) => (value(b.s) > value(a.s) ? b : a));
      return value(top.s) >= minimum ? top : null;
    };

    const zmaj = best((s) => s.bossKills, 1);
    if (zmaj) {
      candidates.push({
        playerId: zmaj.id,
        awardId: 'zmajoubica',
        priority: 74,
        subtitle: zmaj.s.bossKills > 1 ? `${zmaj.s.bossKills} aždaje` : 'Dokrajčio aždaju',
      });
    }
    const kule = best((s) => s.kills, 10);
    if (kule) {
      candidates.push({
        playerId: kule.id,
        awardId: 'gospodar-kula',
        priority: 70,
        subtitle: `${kule.s.kills} ubijenih neprijatelja`,
      });
    }
    const gradi = best((s) => s.built, 5);
    if (gradi) {
      candidates.push({
        playerId: gradi.id,
        awardId: 'graditelj',
        priority: 62,
        subtitle: `${gradi.s.built} sagrađenih kula`,
      });
    }
    if (this.state.mode === 'protiv') {
      const copor = best((s) => s.sent, 6);
      if (copor) {
        candidates.push({
          playerId: copor.id,
          awardId: 'vukodlak',
          priority: 66,
          subtitle: `${copor.s.sent} poslatih neprijatelja`,
        });
      }
    }
    const rich = entries.reduce((a, b) =>
      (this.state.gold.get(b.id) ?? 0) > (this.state.gold.get(a.id) ?? 0) ? b : a
    );
    const richGold = this.state.gold.get(rich.id) ?? 0;
    if (richGold >= 300) {
      candidates.push({
        playerId: rich.id,
        awardId: 'skrtica',
        priority: 50,
        subtitle: `${richGold} neiskorišćenog zlata`,
      });
    }
    return candidates;
  }

  // --- Build state ---------------------------------------------------------

  private addScore(room: Room, playerId: string, points: number): void {
    const p = room.players.find((pl) => pl.id === playerId);
    if (p) p.score += points;
  }

  private scoreOf(room: Room, playerId: string): number {
    return room.players.find((p) => p.id === playerId)?.score ?? 0;
  }

  private statsFor(playerId: string): BedemStats {
    let st = this.state.stats.get(playerId);
    if (!st) {
      st = emptyStats();
      this.state.stats.set(playerId, st);
    }
    return st;
  }

  private playerRef(room: Room, playerId: string): BedemPlayerRef {
    const p = room.players.find((pl) => pl.id === playerId);
    return {
      playerId,
      name: p?.name ?? '?',
      avatarColor: p?.avatarColor ?? '#888888',
      avatarEmoji: p?.avatarEmoji ?? '👤',
    };
  }

  private buildGameState(room: Room): GameState {
    const s = this.state;
    const nextWave = s.phase === 'gradnja' || s.phase === 'uvod' ? s.wave : s.wave + 1;

    const hostData: BedemHostData = {
      mode: s.mode,
      length: s.length,
      layoutId: s.layout.id,
      cols: s.layout.cols,
      rows: s.layout.rows,
      path: s.layout.path,
      wave: s.wave,
      totalWaves: s.totalWaves,
      bossNext: bedemWaveHasBoss(nextWave),
      maps: s.maps.map((m) => ({
        ownerId: m.ownerId,
        lives: m.lives,
        alive: m.alive,
        towers: m.towers.map(({ readyAt: _readyAt, ...t }) => t),
      })),
      roster: [...s.stats.keys()]
        .filter((id) => s.order.includes(id) || s.mode === 'protiv')
        .filter((id) => room.players.some((p) => p.id === id))
        .map((id) => {
          const st = this.statsFor(id);
          return {
            ...this.playerRef(room, id),
            gold: s.gold.get(id) ?? 0,
            score: this.scoreOf(room, id),
            kills: st.kills,
            alive: s.order.includes(id) && (s.mode === 'zajedno' || !!this.myMap(id)),
            place: st.place,
          };
        }),
      readyIds: s.phase === 'gradnja' ? [...s.ready] : [],
    };
    if ((s.phase === 'kraj' || s.phase === 'ended') && s.result) hostData.result = s.result;

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const idx = s.mapOf.get(player.id);
      if (idx === undefined) continue;
      const pd: BedemControllerData = {
        mapIndex: idx,
        gold: s.gold.get(player.id) ?? 0,
        score: player.score,
        kills: this.statsFor(player.id).kills,
      };
      playerData[player.id] = pd as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: s.phase,
      round: s.wave,
      totalRounds: s.totalWaves ?? 0,
      timeRemaining: Math.max(0, Math.ceil(s.phaseTimeRemaining)),
      data: { phase: s.phase, host: hostData },
      playerData,
    };
  }
}
