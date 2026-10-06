import type { BedemEnemyType, BedemFrameShot, BedemTower } from '@igra/shared';
import {
  BEDEM_ARMOR_FLOOR,
  BEDEM_CHAIN_FALLOFF,
  BEDEM_CHAIN_JUMP,
  BEDEM_ENEMIES,
  BEDEM_TOWERS,
  bedemPathPoint,
} from '@igra/shared';

/**
 * Bedem's simulation, as a step function over one map. No sockets, no rooms:
 * the module owns the bookkeeping (gold, score, phases) and reacts to what a
 * step reports, which is also what lets the balance script in
 * scripts/test-bedem.mts run a hundred games in a second.
 *
 * Projectiles are not simulated. A tower that fires hits on the same step and
 * the screens draw the tracer from the reported shot — at these ranges a
 * flying arrow would only add a way to miss that nobody can see or steer.
 */

export interface SimEnemy {
  id: number;
  type: BedemEnemyType;
  hp: number;
  maxHp: number;
  dist: number;
  slowUntil: number;
  slow: number;
  /** Whoever sent it ('protiv'), so a leak can be credited. */
  sentBy: string | null;
}

export interface SimTower extends BedemTower {
  /** ms of map time when it may fire again */
  readyAt: number;
}

export interface PendingSpawn {
  type: BedemEnemyType;
  /** map time (ms) it walks in */
  at: number;
  hpScale: number;
  sentBy: string | null;
}

export interface SimMap {
  ownerId: string | null;
  lives: number;
  alive: boolean;
  towers: SimTower[];
  enemies: SimEnemy[];
  /** Sorted by `at`. */
  queue: PendingSpawn[];
  /** ms since the wave started on this map */
  time: number;
  nextEnemyId: number;
  path: [number, number][];
  pathLength: number;
}

export interface Kill {
  towerOwnerId: string;
  towerId: number;
  type: BedemEnemyType;
  bounty: number;
}

export interface Leak {
  type: BedemEnemyType;
  lives: number;
  sentBy: string | null;
}

export interface StepResult {
  kills: Kill[];
  leaks: Leak[];
  shots: BedemFrameShot[];
  /** owner id → damage dealt this step (for the stats) */
  damage: Map<string, number>;
}

export function createMap(
  ownerId: string | null,
  lives: number,
  path: [number, number][],
  pathLength: number
): SimMap {
  return {
    ownerId,
    lives,
    alive: true,
    towers: [],
    enemies: [],
    queue: [],
    time: 0,
    nextEnemyId: 1,
    path,
    pathLength,
  };
}

/** Queue a spawn, keeping the queue ordered by arrival time. */
export function enqueue(map: SimMap, spawn: PendingSpawn): void {
  let i = map.queue.length;
  while (i > 0 && map.queue[i - 1].at > spawn.at) i--;
  map.queue.splice(i, 0, spawn);
}

/** Nothing left to fight on this map for the current wave. */
export function mapClear(map: SimMap): boolean {
  return map.enemies.length === 0 && map.queue.length === 0;
}

function hitDamage(raw: number, armor: number, pierce: boolean): number {
  if (pierce) return raw;
  return Math.max(raw * BEDEM_ARMOR_FLOOR, raw - armor);
}

export function stepMap(map: SimMap, dtMs: number): StepResult {
  const result: StepResult = { kills: [], leaks: [], shots: [], damage: new Map() };
  if (!map.alive) return result;
  map.time += dtMs;
  const now = map.time;

  // 1. Arrivals.
  while (map.queue.length > 0 && map.queue[0].at <= now) {
    const spawn = map.queue.shift()!;
    const def = BEDEM_ENEMIES[spawn.type];
    const hp = Math.round(def.hp * spawn.hpScale);
    map.enemies.push({
      id: map.nextEnemyId++,
      type: spawn.type,
      hp,
      maxHp: hp,
      dist: 0,
      slowUntil: 0,
      slow: 0,
      sentBy: spawn.sentBy,
    });
  }

  // 2. Movement and leaks.
  const dt = dtMs / 1000;
  const walking: SimEnemy[] = [];
  for (const e of map.enemies) {
    const def = BEDEM_ENEMIES[e.type];
    const factor = now < e.slowUntil ? 1 - e.slow : 1;
    e.dist += def.speed * factor * dt;
    if (e.dist >= map.pathLength) {
      map.lives = Math.max(0, map.lives - def.leak);
      result.leaks.push({ type: e.type, lives: def.leak, sentBy: e.sentBy });
    } else {
      walking.push(e);
    }
  }
  map.enemies = walking;
  if (map.lives <= 0) {
    map.alive = false;
    map.enemies = [];
    map.queue = [];
    return result;
  }

  // 3. Towers. Positions once per step — every tower reads the same picture.
  if (map.enemies.length === 0) return result;
  const pos = new Map<number, { x: number; y: number }>();
  for (const e of map.enemies) pos.set(e.id, bedemPathPoint(map.path, e.dist));
  const dead = new Set<number>();

  const damage = (tower: SimTower, e: SimEnemy, raw: number, pierce: boolean) => {
    if (dead.has(e.id)) return;
    const dealt = Math.min(e.hp, hitDamage(raw, BEDEM_ENEMIES[e.type].armor, pierce));
    e.hp -= dealt;
    result.damage.set(tower.ownerId, (result.damage.get(tower.ownerId) ?? 0) + dealt);
    if (e.hp <= 0.0001) {
      dead.add(e.id);
      result.kills.push({
        towerOwnerId: tower.ownerId,
        towerId: tower.id,
        type: e.type,
        bounty: BEDEM_ENEMIES[e.type].bounty,
      });
    }
  };

  for (const tower of map.towers) {
    if (tower.readyAt > now) continue;
    const def = BEDEM_TOWERS[tower.type];
    const lvl = def.levels[tower.level - 1];
    const cx = tower.c + 0.5;
    const cy = tower.r + 0.5;

    // Target: the one furthest down the path within range — the classic
    // "first" rule, so towers defend the gate rather than chase stragglers.
    let target: SimEnemy | null = null;
    for (const e of map.enemies) {
      if (dead.has(e.id)) continue;
      const p = pos.get(e.id)!;
      if (Math.hypot(p.x - cx, p.y - cy) > lvl.range) continue;
      if (!target || e.dist > target.dist) target = e;
    }
    if (!target) continue;
    tower.readyAt = now + lvl.cooldownMs;
    const hit: number[] = [target.id];

    if (lvl.chain) {
      let current = target;
      let raw = lvl.damage;
      const struck = new Set<number>([target.id]);
      damage(tower, target, raw, !!def.pierce);
      for (let k = 1; k < lvl.chain; k++) {
        const from = pos.get(current.id)!;
        let next: SimEnemy | null = null;
        let best = BEDEM_CHAIN_JUMP;
        for (const e of map.enemies) {
          if (struck.has(e.id) || dead.has(e.id)) continue;
          const p = pos.get(e.id)!;
          const d = Math.hypot(p.x - from.x, p.y - from.y);
          if (d <= best) {
            best = d;
            next = e;
          }
        }
        if (!next) break;
        raw *= BEDEM_CHAIN_FALLOFF;
        struck.add(next.id);
        hit.push(next.id);
        damage(tower, next, raw, !!def.pierce);
        current = next;
      }
    } else if (lvl.splash) {
      const at = pos.get(target.id)!;
      for (const e of map.enemies) {
        const p = pos.get(e.id)!;
        if (Math.hypot(p.x - at.x, p.y - at.y) > lvl.splash) continue;
        if (lvl.slow && lvl.slowMs) {
          // Slows don't stack — the strongest one wins and the clock refreshes.
          e.slow = Math.max(now < e.slowUntil ? e.slow : 0, lvl.slow);
          e.slowUntil = now + lvl.slowMs;
        }
        if (e.id !== target.id) hit.push(e.id);
        damage(tower, e, lvl.damage, !!def.pierce);
      }
    } else {
      damage(tower, target, lvl.damage, !!def.pierce);
    }
    result.shots.push({ t: tower.id, e: hit });
  }

  if (dead.size > 0) map.enemies = map.enemies.filter((e) => !dead.has(e.id));
  return result;
}
