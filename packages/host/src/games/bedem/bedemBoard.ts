// Bedem's map renderer. IDENTICAL COPY in packages/host/src/games/bedem/ and
// packages/controller/src/games/bedem/ — change both (same rule as Puzla's
// puzlaTable.ts). Plain canvas 2D, no React: frames arrive ~10×/s straight
// from the socket and are interpolated here at the display rate, so React
// never re-renders for movement.
//
// Projectiles are purely visual. The server lands every hit on the step it
// fires, but the screen renders BEDEM_RENDER_DELAY_MS behind it — so a shot
// can be launched the moment its frame arrives and still land exactly when the
// render clock reaches the hit (when the enemy's HP drops, or it vanishes).
// The render delay IS the flight time.

import type { BedemFrameMap, BedemTowerType } from '@igra/shared';
import {
  BEDEM_ENEMIES,
  BEDEM_RENDER_DELAY_MS,
  BEDEM_SPRITES,
  BEDEM_TOWERS,
  bedemPathLength,
  bedemPathPoint,
} from '@igra/shared';

export interface BoardTower {
  id: number;
  c: number;
  r: number;
  type: BedemTowerType;
  level: number;
  ownerId: string;
}

export interface BoardSelection {
  c: number;
  r: number;
  /** Range circle to preview, cells. */
  range?: number;
  /** Colour of the cell outline (gold for an empty cell, own colour for a tower). */
  color?: string;
}

interface Snapshot {
  at: number;
  map: BedemFrameMap;
}

type Pt = { x: number; y: number };

/** A shot in flight, in cell units. Homes on its target's live position. */
interface Projectile {
  kind: BedemTowerType;
  from: Pt;
  /** Enemy ids it hits, in order (a bolt's chain; the rest only one). */
  targets: number[];
  /** Where each target stood in the frame — used once it has vanished. */
  fallback: Pt[];
  launch: number;
  land: number;
  /** Splash radius, cells (katapult / led). */
  radius?: number;
  level: number;
  /** Small per-shot variety, so a volley doesn't fly as one line. */
  seed: number;
}

/** Things that happen at one spot and fade: impacts, deaths, leaks. */
interface Effect {
  kind: 'spark' | 'crater' | 'frost' | 'zap' | 'puff' | 'leak';
  at: number;
  dur: number;
  /** Follows this enemy while it lives (hit sparks), otherwise stays at `pos`. */
  enemyId?: number;
  pos: Pt;
  radius?: number;
}

const COLORS = {
  ground: '#1F3A2C',
  groundAlt: '#22402F',
  grid: 'rgba(245,235,224,0.05)',
  path: '#7A5B3A',
  pathEdge: '#94704A',
  wall: '#C29B47',
  wallDark: '#8E6F2E',
  portal: '#0B1C33',
  towerBase: '#10243F',
  hpBack: 'rgba(11,28,51,0.85)',
  hp: '#7FD18B',
  hpLow: '#E06A5E',
  cream: '#F5EBE0',
  frost: '#9FD3F5',
  bolt: '#D4C2FF',
  arrow: '#E3C27A',
  rock: '#8A7360',
  shadow: 'rgba(0,0,0,0.28)',
};

const ENEMY_COLORS: Record<string, string> = {
  vuk: '#8C98A8',
  pesak: '#6E8F5A',
  oklopnik: '#9AA3AE',
  roj: '#6B5A8E',
  azdaja: '#B5473A',
};

/** Flight times, ms — each at most the render delay, so a shot never lands late. */
const FLIGHT: Record<BedemTowerType, number> = {
  strelac: 150,
  katapult: Math.min(BEDEM_RENDER_DELAY_MS, 250),
  led: 190,
  // Lightning doesn't fly — it strikes when the render clock reaches the hit.
  munja: 0,
};
/** How long a tower stays "kicked back" after firing. */
const FIRE_PULSE_MS = 160;

/** Top/bottom margin in cells, so the entrance and the gate show past the grid. */
const MARGIN = 0.35;

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const lerp = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** Per-frame transform for an animated sprite: dy in px, rot in radians. */
interface Pose {
  dy: number;
  rot: number;
  sx: number;
  sy: number;
}

export class BedemBoard {
  private ctx: CanvasRenderingContext2D;
  private cols = 8;
  private rows = 12;
  private path: [number, number][] = [];
  private pathLength = 1;
  private towers: BoardTower[] = [];
  private colors: Record<string, string> = {};
  private highlightOwner: string | null = null;
  private selection: BoardSelection | null = null;
  private snapshots: Snapshot[] = [];
  private projectiles: Projectile[] = [];
  private effects: Effect[] = [];
  /** tower id → when it last fired (render clock), for the recoil pulse */
  private fired = new Map<number, number>();
  /** enemy id → its position this draw (cell units) */
  private livePos = new Map<number, Pt>();
  private cell = 10;
  private ox = 0;
  private oy = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf = 0;
  private dirty = true;
  private activeUntil = 0;
  private sprites = new Map<string, HTMLCanvasElement>();
  /** Decoded vector art by sprite key; an entry exists once its decode was requested. */
  private art = new Map<string, HTMLImageElement>();
  private disposed = false;
  private reduced = reducedMotion();

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setLayout(cols: number, rows: number, path: [number, number][]): void {
    if (cols === this.cols && rows === this.rows && path === this.path) return;
    this.cols = cols;
    this.rows = rows;
    this.path = path;
    this.pathLength = bedemPathLength(path);
    this.fit();
  }

  setTowers(towers: BoardTower[], colors: Record<string, string>): void {
    this.towers = towers;
    this.colors = colors;
    this.dirty = true;
  }

  setHighlightOwner(ownerId: string | null): void {
    this.highlightOwner = ownerId;
    this.dirty = true;
  }

  setSelection(sel: BoardSelection | null): void {
    this.selection = sel;
    this.dirty = true;
  }

  /** Drop every enemy and effect — a wave ended or a new one is about to start. */
  clearEnemies(): void {
    this.snapshots = [];
    this.projectiles = [];
    this.effects = [];
    this.fired.clear();
    this.dirty = true;
  }

  pushFrame(map: BedemFrameMap): void {
    const at = performance.now();
    const prev = this.snapshots[this.snapshots.length - 1];
    // When the render clock reaches this frame — i.e. when its hits land.
    const hitAt = at + BEDEM_RENDER_DELAY_MS;

    const byId = new Map(map.e.map((e) => [e.i, e]));
    const prevById = new Map((prev?.map.e ?? []).map((e) => [e.i, e]));
    const enemyPos = (id: number): Pt | null => {
      const e = byId.get(id) ?? prevById.get(id);
      return e ? bedemPathPoint(this.path, e.d) : null;
    };

    for (const shot of map.s) {
      const tower = this.towers.find((t) => t.id === shot.t);
      if (!tower) continue;
      const fallback: Pt[] = [];
      const targets: number[] = [];
      for (const id of shot.e) {
        const p = enemyPos(id);
        if (!p) continue;
        targets.push(id);
        fallback.push(p);
      }
      if (targets.length === 0) continue;
      const lvl = BEDEM_TOWERS[tower.type].levels[tower.level - 1];
      const flight = this.reduced ? 0 : FLIGHT[tower.type];
      const launch = hitAt - flight;
      // Splash towers report the whole blast; the shell only flies at the first.
      const flying = tower.type === 'munja' ? targets : targets.slice(0, 1);
      this.projectiles.push({
        kind: tower.type,
        from: { x: tower.c + 0.5, y: tower.r + 0.5 },
        targets: flying,
        fallback: fallback.slice(0, flying.length),
        launch,
        land: hitAt,
        radius: lvl.splash,
        level: tower.level,
        seed: Math.random(),
      });
      this.fired.set(tower.id, launch);

      // Impacts, at the moment of the hit.
      if (tower.type === 'katapult') {
        this.effects.push({ kind: 'crater', at: hitAt, dur: 420, pos: fallback[0], radius: lvl.splash });
      } else if (tower.type === 'led') {
        this.effects.push({ kind: 'frost', at: hitAt, dur: 380, pos: fallback[0], radius: lvl.splash });
      }
      const sparkKind = tower.type === 'munja' ? 'zap' : 'spark';
      targets.forEach((id, i) => {
        this.effects.push({ kind: sparkKind, at: hitAt, dur: 200, enemyId: id, pos: fallback[i] });
      });
    }

    // Whoever vanished since the last frame either died (puff) or reached the gate.
    if (prev) {
      for (const e of prev.map.e) {
        if (byId.has(e.i)) continue;
        const p = bedemPathPoint(this.path, e.d);
        const leaked = e.d > this.pathLength - 0.8;
        this.effects.push({
          kind: leaked ? 'leak' : 'puff',
          pos: p,
          at: hitAt,
          dur: leaked ? 500 : 360,
          radius: BEDEM_ENEMIES[e.t].size,
        });
      }
    }

    this.snapshots.push({ at, map });
    if (this.snapshots.length > 8) this.snapshots.shift();
    this.activeUntil = at + 1500;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.sprites.clear();
    this.fit();
  }

  /** The grid cell under a client-space point, or null outside the grid. */
  cellAt(clientX: number, clientY: number): { c: number; r: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.ox) / this.cell;
    const y = (clientY - rect.top - this.oy) / this.cell;
    const c = Math.floor(x);
    const r = Math.floor(y);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    return { c, r };
  }

  /** Cell size in CSS px — lets the UI decide whether the board is tappable. */
  cellSize(): number {
    return this.cell;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
  }

  // --- internals -------------------------------------------------------------

  private fit(): void {
    const h = this.rows + MARGIN * 2;
    this.cell = Math.max(4, Math.min(this.width / this.cols, this.height / h));
    this.ox = (this.width - this.cell * this.cols) / 2;
    this.oy = (this.height - this.cell * h) / 2 + MARGIN * this.cell;
    this.dirty = true;
  }

  private loop(now: number): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    // Idle boards (build phase, nothing moving) only redraw when told to.
    const busy = this.effects.length > 0 || this.projectiles.length > 0;
    if (!this.dirty && now > this.activeUntil && !busy) return;
    this.dirty = false;
    this.draw(now);
  }

  private px(x: number): number {
    return this.ox + x * this.cell;
  }

  private py(y: number): number {
    return this.oy + y * this.cell;
  }

  private toPx(p: Pt): Pt {
    return { x: this.px(p.x), y: this.py(p.y) };
  }

  /** The decoded vector art for a key, or null while it is still loading (or has none). */
  private artFor(key: string): HTMLImageElement | null {
    const have = this.art.get(key);
    if (have) return have.complete && have.naturalWidth > 0 ? have : null;
    const svg = BEDEM_SPRITES[key];
    if (!svg) return null;
    const img = new Image();
    img.onload = () => {
      if (this.disposed) return;
      this.sprites.clear();
      this.dirty = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    this.art.set(key, img);
    return null;
  }

  /** Vector art when it is ready, the emoji glyph until then. */
  private sprite(key: string, emoji: string, size: number): HTMLCanvasElement {
    const px = Math.max(8, Math.round(size * this.dpr));
    const art = this.artFor(key);
    const cacheKey = `${art ? key : emoji}@${px}`;
    let s = this.sprites.get(cacheKey);
    if (!s) {
      s = document.createElement('canvas');
      s.width = s.height = Math.ceil(px * 1.3);
      const c = s.getContext('2d')!;
      if (art) {
        const off = (s.width - px) / 2;
        c.drawImage(art, off, off, px, px);
      } else {
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        c.fillText(emoji, s.width / 2, s.height / 2 + px * 0.06);
      }
      this.sprites.set(cacheKey, s);
    }
    return s;
  }

  private drawSprite(key: string, emoji: string, x: number, y: number, size: number, pose?: Pose): void {
    const s = this.sprite(key, emoji, size);
    const w = s.width / this.dpr;
    if (!pose) {
      this.ctx.drawImage(s, x - w / 2, y - w / 2, w, w);
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y + pose.dy);
    ctx.rotate(pose.rot);
    ctx.scale(pose.sx, pose.sy);
    ctx.drawImage(s, -w / 2, -w / 2, w, w);
    ctx.restore();
  }

  /** A light walk cycle per enemy type. Phase is offset by id so a pack doesn't move in lockstep. */
  private enemyPose(type: string, id: number, now: number, slowed: boolean, rad: number): Pose | undefined {
    if (this.reduced) return undefined;
    const t = (now / 1000) * (slowed ? 0.5 : 1) + id * 1.7;
    const tau = Math.PI * 2;
    switch (type) {
      case 'vuk': {
        const w = t * tau * 1.6;
        return { dy: -Math.abs(Math.sin(w)) * rad * 0.22, rot: Math.sin(w) * 0.1, sx: 1, sy: 1 + Math.sin(w * 2) * 0.04 };
      }
      case 'pesak': {
        const w = t * tau * 1.1;
        return { dy: -Math.abs(Math.sin(w)) * rad * 0.08, rot: Math.sin(w) * 0.17, sx: 1, sy: 1 };
      }
      case 'oklopnik': {
        const w = t * tau * 0.9;
        return { dy: -Math.abs(Math.sin(w)) * rad * 0.1, rot: Math.sin(w) * 0.05, sx: 1, sy: 1 + Math.sin(w * 2) * 0.03 };
      }
      case 'roj': {
        const w = t * tau * 3.2;
        return { dy: Math.sin(w * 0.5) * rad * 0.2, rot: Math.sin(w * 0.5) * 0.08, sx: 0.84 + Math.cos(w) * 0.16, sy: 1 };
      }
      case 'azdaja': {
        const w = t * tau * 0.7;
        const k = 1 + Math.sin(w) * 0.05;
        return { dy: 0, rot: Math.sin(w * 0.5) * 0.04, sx: k, sy: k };
      }
      default:
        return undefined;
    }
  }

  /** A projectile's target right now: the live enemy, or where it was last seen. */
  private targetPos(p: Projectile, i: number): Pt {
    return this.livePos.get(p.targets[i]) ?? p.fallback[i];
  }

  private draw(now: number): void {
    const ctx = this.ctx;
    const cell = this.cell;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawGround();

    // Selection + range preview under the towers.
    const sel = this.selection;
    if (sel?.range) {
      ctx.beginPath();
      ctx.arc(this.px(sel.c + 0.5), this.py(sel.r + 0.5), sel.range * cell, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245,235,224,0.09)';
      ctx.fill();
      ctx.setLineDash([cell * 0.15, cell * 0.12]);
      ctx.strokeStyle = 'rgba(245,235,224,0.55)';
      ctx.lineWidth = Math.max(1, cell * 0.04);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Ground-level effects (craters, frost) go under the enemies.
    this.effects = this.effects.filter((fx) => now < fx.at + fx.dur);
    for (const fx of this.effects) {
      if (now >= fx.at && (fx.kind === 'crater' || fx.kind === 'frost')) this.drawEffect(fx, now);
    }

    this.drawTowers(now);

    if (sel) {
      roundRect(ctx, this.px(sel.c) + 1, this.py(sel.r) + 1, cell - 2, cell - 2, cell * 0.18);
      ctx.lineWidth = Math.max(2, cell * 0.07);
      ctx.strokeStyle = sel.color ?? COLORS.cream;
      ctx.stroke();
    }

    this.drawEnemies(now);

    // Shots in flight, then the impacts on top.
    this.projectiles = this.projectiles.filter((p) => now < p.land + (p.kind === 'munja' ? 180 : 0));
    for (const p of this.projectiles) {
      if (now >= p.launch) this.drawProjectile(p, now);
    }
    for (const fx of this.effects) {
      if (now >= fx.at && fx.kind !== 'crater' && fx.kind !== 'frost') this.drawEffect(fx, now);
    }
  }

  private drawGround(): void {
    const ctx = this.ctx;
    const cell = this.cell;
    // Ground, checkered just enough to read as a grid you can tap.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? COLORS.ground : COLORS.groundAlt;
        ctx.fillRect(this.px(c), this.py(r), cell + 0.5, cell + 0.5);
      }
    }

    // Path: a thick rounded polyline through the cell centres, edge first.
    if (this.path.length > 1) {
      const trace = () => {
        ctx.beginPath();
        this.path.forEach(([c, r], i) => {
          const x = this.px(c + 0.5);
          const y = this.py(Math.max(-MARGIN, Math.min(this.rows + MARGIN, r + 0.5)));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
      };
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';
      ctx.strokeStyle = COLORS.pathEdge;
      ctx.lineWidth = cell * 0.9;
      trace();
      ctx.stroke();
      ctx.strokeStyle = COLORS.path;
      ctx.lineWidth = cell * 0.74;
      trace();
      ctx.stroke();

      // Entrance: a dark mouth at the top edge.
      const [ec] = this.path[0];
      ctx.fillStyle = COLORS.portal;
      ctx.fillRect(this.px(ec + 0.08), this.py(-MARGIN), cell * 0.84, MARGIN * cell);

      // Gate: the wall along the bottom with a gold gate where the path ends.
      const [gc] = this.path[this.path.length - 1];
      ctx.fillStyle = COLORS.wallDark;
      ctx.fillRect(this.px(0), this.py(this.rows), this.cols * cell, MARGIN * cell);
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(this.px(gc + 0.05), this.py(this.rows), cell * 0.9, MARGIN * cell);
    }

    // Grid lines on top of the ground only.
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= this.cols; c++) {
      ctx.moveTo(this.px(c), this.py(0));
      ctx.lineTo(this.px(c), this.py(this.rows));
    }
    for (let r = 0; r <= this.rows; r++) {
      ctx.moveTo(this.px(0), this.py(r));
      ctx.lineTo(this.px(this.cols), this.py(r));
    }
    ctx.stroke();
  }

  private drawTowers(now: number): void {
    const ctx = this.ctx;
    const cell = this.cell;
    for (const t of this.towers) {
      const x = this.px(t.c);
      const y = this.py(t.r);
      const inset = cell * 0.08;
      const own = this.highlightOwner !== null && t.ownerId === this.highlightOwner;
      const ring = this.colors[t.ownerId] ?? COLORS.cream;

      // Recoil: a quick squash-and-glow right as the shot leaves.
      const since = now - (this.fired.get(t.id) ?? -Infinity);
      const pulse = since >= 0 && since < FIRE_PULSE_MS && !this.reduced ? 1 - since / FIRE_PULSE_MS : 0;

      roundRect(ctx, x + inset, y + inset, cell - inset * 2, cell - inset * 2, cell * 0.18);
      ctx.fillStyle = COLORS.towerBase;
      ctx.fill();
      if (pulse > 0) {
        ctx.save();
        ctx.shadowColor = BEDEM_TOWERS[t.type].color;
        ctx.shadowBlur = cell * 0.5 * pulse;
        ctx.lineWidth = Math.max(1.5, cell * 0.08);
        ctx.strokeStyle = BEDEM_TOWERS[t.type].color;
        ctx.stroke();
        ctx.restore();
      }
      ctx.lineWidth = Math.max(1.5, cell * (own ? 0.09 : 0.06));
      ctx.strokeStyle = ring;
      ctx.stroke();
      this.drawSprite(t.type, BEDEM_TOWERS[t.type].emoji, x + cell / 2, y + cell * (0.45 + 0.03 * pulse), cell * (0.62 - 0.06 * pulse));
      // Level pips.
      for (let k = 0; k < t.level; k++) {
        ctx.beginPath();
        ctx.arc(x + cell / 2 + (k - (t.level - 1) / 2) * cell * 0.17, y + cell * 0.8, cell * 0.055, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.wall;
        ctx.fill();
      }
    }
  }

  /** Enemies, interpolated between the two frames around the render clock. */
  private drawEnemies(now: number): void {
    const ctx = this.ctx;
    const cell = this.cell;
    this.livePos.clear();
    const renderAt = now - BEDEM_RENDER_DELAY_MS;
    const snaps = this.snapshots;
    if (snaps.length === 0) return;
    let a = snaps[0];
    let b = snaps[0];
    for (let i = 0; i < snaps.length; i++) {
      if (snaps[i].at <= renderAt) a = snaps[i];
      b = snaps[i];
      if (snaps[i].at > renderAt) break;
    }
    const span = b.at - a.at;
    const k = span > 0 ? Math.max(0, Math.min(1, (renderAt - a.at) / span)) : 1;
    const prev = new Map(a.map.e.map((e) => [e.i, e]));
    // An enemy killed in b is still alive on screen until the render clock gets
    // there — keep drawing it from a, so the projectile has something to hit.
    const next = new Map(b.map.e.map((e) => [e.i, e]));
    const list = [...b.map.e];
    if (b !== a && k < 1) for (const e of a.map.e) if (!next.has(e.i)) list.push(e);
    // Draw the furthest-along last, so the leader sits on top of the queue.
    list.sort((p, q) => p.d - q.d);

    for (const e of list) {
      const from = prev.get(e.i);
      const to = next.get(e.i);
      // Newcomers wait until the render clock reaches the frame they appeared in.
      if (!from && b !== a && k < 1) continue;
      const d = from && to ? from.d + (to.d - from.d) * k : (to ?? from)!.d;
      // HP drops when the hit lands, not before.
      const hp = to && k >= 1 ? to.h : (from ?? to)!.h;
      const slowed = (k >= 1 ? to?.s : from?.s) ?? false;
      const p = bedemPathPoint(this.path, d);
      this.livePos.set(e.i, p);
      const def = BEDEM_ENEMIES[e.t];
      const x = this.px(p.x);
      const y = this.py(p.y);
      const rad = def.size * cell;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = ENEMY_COLORS[e.t] ?? '#999';
      ctx.fill();
      if (slowed) {
        ctx.lineWidth = Math.max(1.5, cell * 0.06);
        ctx.strokeStyle = COLORS.frost;
        ctx.stroke();
      }
      this.drawSprite(e.t, def.emoji, x, y, rad * 1.7, this.enemyPose(e.t, e.i, now, slowed, rad));
      if (hp < 100) {
        const w = Math.max(rad * 2, cell * 0.5);
        const hh = Math.max(2, cell * 0.07);
        ctx.fillStyle = COLORS.hpBack;
        ctx.fillRect(x - w / 2, y - rad - hh * 2, w, hh);
        ctx.fillStyle = hp < 35 ? COLORS.hpLow : COLORS.hp;
        ctx.fillRect(x - w / 2, y - rad - hh * 2, (w * hp) / 100, hh);
      }
    }
  }

  private drawProjectile(p: Projectile, now: number): void {
    const ctx = this.ctx;
    const cell = this.cell;
    const flight = p.land - p.launch;
    const t = flight > 0 ? Math.min(1, (now - p.launch) / flight) : 1;

    switch (p.kind) {
      case 'strelac': {
        // A straight, fast arrow that homes on its target, with a short streak.
        const to = this.targetPos(p, 0);
        const head = this.toPx(lerp(p.from, to, t));
        const tail = this.toPx(lerp(p.from, to, Math.max(0, t - 0.35)));
        const ang = Math.atan2(head.y - tail.y, head.x - tail.x);
        const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        grad.addColorStop(0, 'rgba(227,194,122,0)');
        grad.addColorStop(1, COLORS.arrow);
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(1.5, cell * (0.045 + 0.01 * p.level));
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
        const s = cell * 0.13;
        ctx.fillStyle = COLORS.cream;
        ctx.beginPath();
        ctx.moveTo(head.x + Math.cos(ang) * s, head.y + Math.sin(ang) * s);
        ctx.lineTo(head.x + Math.cos(ang + 2.5) * s * 0.8, head.y + Math.sin(ang + 2.5) * s * 0.8);
        ctx.lineTo(head.x + Math.cos(ang - 2.5) * s * 0.8, head.y + Math.sin(ang - 2.5) * s * 0.8);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'katapult': {
        // A lobbed rock: parabola in screen space, its shadow sliding on the ground.
        const to = this.targetPos(p, 0);
        const ground = this.toPx(lerp(p.from, to, t));
        const dist = Math.hypot(to.x - p.from.x, to.y - p.from.y);
        const height = cell * (0.6 + 0.25 * dist) * 4 * t * (1 - t);
        const size = cell * (0.13 + 0.02 * p.level) * (1 + 0.35 * 4 * t * (1 - t));
        ctx.fillStyle = COLORS.shadow;
        ctx.beginPath();
        ctx.ellipse(ground.x, ground.y, size, size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        const spin = (p.seed + t) * Math.PI * 3;
        ctx.save();
        ctx.translate(ground.x, ground.y - height);
        ctx.rotate(spin);
        ctx.fillStyle = COLORS.rock;
        ctx.beginPath();
        // A lumpy pentagon reads as a rock at any size.
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const r = size * (0.85 + 0.2 * Math.sin(i * 2.3 + p.seed * 7));
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = Math.max(1, cell * 0.025);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'led': {
        // A glowing frost orb on a slight curve, leaving a short sparkling trail.
        const to = this.targetPos(p, 0);
        const bend = (p.seed - 0.5) * 0.8;
        const at = (k: number): Pt => {
          const base = lerp(p.from, to, easeOut(k));
          const nx = -(to.y - p.from.y);
          const ny = to.x - p.from.x;
          const arc = 4 * k * (1 - k) * bend * 0.35;
          return { x: base.x + nx * arc, y: base.y + ny * arc };
        };
        for (let i = 4; i >= 1; i--) {
          const tp = this.toPx(at(Math.max(0, t - i * 0.07)));
          ctx.fillStyle = `rgba(159,211,245,${0.14 * (5 - i)})`;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, cell * 0.06 * (5 - i) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        const pos = this.toPx(at(t));
        ctx.save();
        ctx.shadowColor = COLORS.frost;
        ctx.shadowBlur = cell * 0.35;
        ctx.fillStyle = '#E8F6FF';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, cell * (0.09 + 0.015 * p.level), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'munja': {
        // Lightning strikes at the hit and flickers: re-jagged every frame, so
        // it crackles instead of sitting there as a static zig-zag.
        const age = now - p.land;
        if (age < 0) break;
        const alpha = Math.max(0, 1 - age / 180);
        const pts = [p.from, ...p.targets.map((_, i) => this.targetPos(p, i))].map((q) => this.toPx(q));
        const jag = () => {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            const p0 = pts[i - 1];
            const p1 = pts[i];
            const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
            const steps = Math.max(2, Math.round(len / (cell * 0.35)));
            const nx = -(p1.y - p0.y) / (len || 1);
            const ny = (p1.x - p0.x) / (len || 1);
            for (let s = 1; s < steps; s++) {
              const k = s / steps;
              const off = (Math.random() - 0.5) * cell * 0.28;
              ctx.lineTo(p0.x + (p1.x - p0.x) * k + nx * off, p0.y + (p1.y - p0.y) * k + ny * off);
            }
            ctx.lineTo(p1.x, p1.y);
          }
        };
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineJoin = 'round';
        ctx.shadowColor = COLORS.bolt;
        ctx.shadowBlur = cell * 0.4;
        ctx.strokeStyle = COLORS.bolt;
        ctx.lineWidth = Math.max(2, cell * 0.09);
        jag();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1, cell * 0.035);
        jag();
        ctx.stroke();
        ctx.restore();
        break;
      }
    }
  }

  private drawEffect(fx: Effect, now: number): void {
    const ctx = this.ctx;
    const cell = this.cell;
    const t = Math.min(1, (now - fx.at) / fx.dur);
    const world = (fx.enemyId !== undefined && this.livePos.get(fx.enemyId)) || fx.pos;
    const p = this.toPx(world);
    ctx.save();
    switch (fx.kind) {
      case 'spark': {
        // A few short rays bursting off the enemy that was hit.
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = COLORS.cream;
        ctx.lineWidth = Math.max(1, cell * 0.035);
        const r0 = cell * (0.12 + 0.18 * t);
        const r1 = r0 + cell * 0.12 * (1 - t);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + (fx.enemyId ?? 0);
          ctx.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0);
          ctx.lineTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1);
        }
        ctx.stroke();
        break;
      }
      case 'zap': {
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.fillStyle = COLORS.bolt;
        ctx.beginPath();
        ctx.arc(p.x, p.y, cell * (0.18 + 0.2 * t), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'crater': {
        // Dust ring spreading over the whole splash, plus a brief dark scorch.
        const r = (fx.radius ?? 0.8) * cell;
        ctx.globalAlpha = (1 - t) * 0.5;
        ctx.fillStyle = 'rgba(40,28,18,1)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 0.45, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = '#C9A27A';
        ctx.lineWidth = Math.max(1.5, cell * 0.08 * (1 - t));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * easeOut(t), 0, Math.PI * 2);
        ctx.stroke();
        // Pebbles flung out.
        ctx.fillStyle = COLORS.rock;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          const d = r * 0.9 * easeOut(t);
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d - cell * 0.3 * 4 * t * (1 - t), cell * 0.04, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'frost': {
        const r = (fx.radius ?? 0.7) * cell;
        ctx.globalAlpha = (1 - t) * 0.6;
        ctx.fillStyle = 'rgba(159,211,245,1)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * easeOut(t), 0, Math.PI * 2);
        ctx.fill();
        // Six ice shards around the rim.
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = '#E8F6FF';
        ctx.lineWidth = Math.max(1, cell * 0.04);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const d = r * easeOut(t);
          ctx.moveTo(p.x + Math.cos(a) * d * 0.6, p.y + Math.sin(a) * d * 0.6);
          ctx.lineTo(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
        }
        ctx.stroke();
        break;
      }
      case 'puff': {
        ctx.globalAlpha = (1 - t) * 0.6;
        ctx.fillStyle = COLORS.cream;
        const r = (fx.radius ?? 0.25) * cell;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.8;
          const d = r * 0.8 * easeOut(t);
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d - cell * 0.15 * t, r * (0.55 + 0.4 * t), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'leak': {
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = 'rgba(224,106,94,0.55)';
        ctx.fillRect(this.px(0), this.py(this.rows - 0.4), this.cols * cell, (0.4 + MARGIN) * cell);
        break;
      }
    }
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
