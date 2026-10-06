// Bedem's map renderer. IDENTICAL COPY in packages/host/src/games/bedem/ and
// packages/controller/src/games/bedem/ — change both (same rule as Puzla's
// puzlaTable.ts). Plain canvas 2D, no React: frames arrive ~10×/s straight
// from the socket and are interpolated here at the display rate, so React
// never re-renders for movement.

import type { BedemFrameMap, BedemTowerType } from '@igra/shared';
import {
  BEDEM_ENEMIES,
  BEDEM_RENDER_DELAY_MS,
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

interface Effect {
  kind: 'arrow' | 'rock' | 'frost' | 'bolt' | 'puff' | 'leak';
  points: { x: number; y: number }[];
  at: number;
  dur: number;
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
  rock: '#C9A27A',
};

const ENEMY_COLORS: Record<string, string> = {
  vuk: '#8C98A8',
  pesak: '#6E8F5A',
  oklopnik: '#9AA3AE',
  roj: '#6B5A8E',
  azdaja: '#B5473A',
};

/** Top/bottom margin in cells, so the entrance and the gate show past the grid. */
const MARGIN = 0.35;

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
  private effects: Effect[] = [];
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
  private disposed = false;

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
    this.effects = [];
    this.dirty = true;
  }

  pushFrame(map: BedemFrameMap): void {
    const at = performance.now();
    const prev = this.snapshots[this.snapshots.length - 1];

    // Shots become effects that play when the render clock reaches this frame.
    const show = at + BEDEM_RENDER_DELAY_MS;
    const byId = new Map(map.e.map((e) => [e.i, e]));
    const prevById = new Map((prev?.map.e ?? []).map((e) => [e.i, e]));
    const enemyPos = (id: number) => {
      const e = byId.get(id) ?? prevById.get(id);
      return e ? bedemPathPoint(this.path, e.d) : null;
    };
    for (const shot of map.s) {
      const tower = this.towers.find((t) => t.id === shot.t);
      if (!tower) continue;
      const from = { x: tower.c + 0.5, y: tower.r + 0.5 };
      const hits = shot.e.map(enemyPos).filter((p): p is { x: number; y: number } => !!p);
      if (hits.length === 0) continue;
      const lvl = BEDEM_TOWERS[tower.type].levels[tower.level - 1];
      switch (tower.type) {
        case 'strelac':
          this.effects.push({ kind: 'arrow', points: [from, hits[0]], at: show, dur: 130 });
          break;
        case 'katapult':
          this.effects.push({ kind: 'rock', points: [from, hits[0]], at: show, dur: 280, radius: lvl.splash });
          break;
        case 'led':
          this.effects.push({ kind: 'frost', points: [from, hits[0]], at: show, dur: 300, radius: lvl.splash });
          break;
        case 'munja':
          this.effects.push({ kind: 'bolt', points: [from, ...hits], at: show, dur: 170 });
          break;
      }
    }

    // Whoever vanished since the last frame either died (puff) or reached the gate.
    if (prev) {
      for (const e of prev.map.e) {
        if (byId.has(e.i)) continue;
        const p = bedemPathPoint(this.path, e.d);
        const leaked = e.d > this.pathLength - 0.8;
        this.effects.push({
          kind: leaked ? 'leak' : 'puff',
          points: [p],
          at: show,
          dur: leaked ? 500 : 320,
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
    if (!this.dirty && now > this.activeUntil && this.effects.length === 0) return;
    this.dirty = false;
    this.draw(now);
  }

  private px(x: number): number {
    return this.ox + x * this.cell;
  }

  private py(y: number): number {
    return this.oy + y * this.cell;
  }

  private sprite(emoji: string, size: number): HTMLCanvasElement {
    const px = Math.max(8, Math.round(size * this.dpr));
    const key = `${emoji}@${px}`;
    let s = this.sprites.get(key);
    if (!s) {
      s = document.createElement('canvas');
      s.width = s.height = Math.ceil(px * 1.3);
      const c = s.getContext('2d')!;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      c.fillText(emoji, s.width / 2, s.height / 2 + px * 0.06);
      this.sprites.set(key, s);
    }
    return s;
  }

  private drawEmoji(emoji: string, x: number, y: number, size: number): void {
    const s = this.sprite(emoji, size);
    const w = s.width / this.dpr;
    this.ctx.drawImage(s, x - w / 2, y - w / 2, w, w);
  }

  private draw(now: number): void {
    const ctx = this.ctx;
    const cell = this.cell;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

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

    // Towers.
    for (const t of this.towers) {
      const x = this.px(t.c);
      const y = this.py(t.r);
      const inset = cell * 0.08;
      const own = this.highlightOwner !== null && t.ownerId === this.highlightOwner;
      const ring = this.colors[t.ownerId] ?? COLORS.cream;
      roundRect(ctx, x + inset, y + inset, cell - inset * 2, cell - inset * 2, cell * 0.18);
      ctx.fillStyle = COLORS.towerBase;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, cell * (own ? 0.09 : 0.06));
      ctx.strokeStyle = ring;
      ctx.stroke();
      this.drawEmoji(BEDEM_TOWERS[t.type].emoji, x + cell / 2, y + cell * 0.45, cell * 0.5);
      // Level pips.
      for (let k = 0; k < t.level; k++) {
        ctx.beginPath();
        ctx.arc(x + cell / 2 + (k - (t.level - 1) / 2) * cell * 0.17, y + cell * 0.8, cell * 0.055, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.wall;
        ctx.fill();
      }
    }

    if (sel) {
      roundRect(ctx, this.px(sel.c) + 1, this.py(sel.r) + 1, cell - 2, cell - 2, cell * 0.18);
      ctx.lineWidth = Math.max(2, cell * 0.07);
      ctx.strokeStyle = sel.color ?? COLORS.cream;
      ctx.stroke();
    }

    // Enemies, interpolated between the two frames around the render clock.
    const renderAt = now - BEDEM_RENDER_DELAY_MS;
    const snaps = this.snapshots;
    if (snaps.length > 0) {
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
      // Draw the furthest-along last, so the leader sits on top of the queue.
      const list = [...b.map.e].sort((p, q) => p.d - q.d);
      for (const e of list) {
        const from = prev.get(e.i);
        // Newcomers wait until the render clock reaches the frame they appeared in.
        if (!from && b !== a && k < 1) continue;
        const d = from ? from.d + (e.d - from.d) * k : e.d;
        const p = bedemPathPoint(this.path, d);
        const def = BEDEM_ENEMIES[e.t];
        const x = this.px(p.x);
        const y = this.py(p.y);
        const rad = def.size * cell;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fillStyle = ENEMY_COLORS[e.t] ?? '#999';
        ctx.fill();
        if (e.s) {
          ctx.lineWidth = Math.max(1.5, cell * 0.06);
          ctx.strokeStyle = COLORS.frost;
          ctx.stroke();
        }
        this.drawEmoji(def.emoji, x, y, rad * 1.45);
        if (e.h < 100) {
          const w = Math.max(rad * 2, cell * 0.5);
          const hh = Math.max(2, cell * 0.07);
          ctx.fillStyle = COLORS.hpBack;
          ctx.fillRect(x - w / 2, y - rad - hh * 2, w, hh);
          ctx.fillStyle = e.h < 35 ? COLORS.hpLow : COLORS.hp;
          ctx.fillRect(x - w / 2, y - rad - hh * 2, (w * e.h) / 100, hh);
        }
      }
    }

    // Effects.
    this.effects = this.effects.filter((fx) => now < fx.at + fx.dur);
    for (const fx of this.effects) {
      if (now < fx.at) continue;
      const t = (now - fx.at) / fx.dur;
      const alpha = 1 - t;
      const pts = fx.points.map((p) => ({ x: this.px(p.x), y: this.py(p.y) }));
      ctx.globalAlpha = Math.max(0, alpha);
      switch (fx.kind) {
        case 'arrow': {
          ctx.strokeStyle = COLORS.arrow;
          ctx.lineWidth = Math.max(1.5, cell * 0.05);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.stroke();
          break;
        }
        case 'rock':
        case 'frost': {
          const at = pts[1];
          const r = (fx.radius ?? 0.8) * cell * (0.4 + 0.6 * t);
          ctx.beginPath();
          ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
          ctx.fillStyle = fx.kind === 'rock' ? 'rgba(201,162,122,0.35)' : 'rgba(159,211,245,0.3)';
          ctx.fill();
          ctx.lineWidth = Math.max(1.5, cell * 0.05);
          ctx.strokeStyle = fx.kind === 'rock' ? COLORS.rock : COLORS.frost;
          ctx.stroke();
          break;
        }
        case 'bolt': {
          ctx.strokeStyle = COLORS.bolt;
          ctx.lineWidth = Math.max(1.5, cell * 0.06);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            const p0 = pts[i - 1];
            const p1 = pts[i];
            // One jag per hop — enough to read as lightning.
            const mx = (p0.x + p1.x) / 2 + (p1.y - p0.y) * 0.18;
            const my = (p0.y + p1.y) / 2 - (p1.x - p0.x) * 0.18;
            ctx.lineTo(mx, my);
            ctx.lineTo(p1.x, p1.y);
          }
          ctx.stroke();
          break;
        }
        case 'puff': {
          const p = pts[0];
          ctx.beginPath();
          ctx.arc(p.x, p.y, (fx.radius ?? 0.25) * cell * (1 + t), 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(245,235,224,0.35)';
          ctx.fill();
          break;
        }
        case 'leak': {
          ctx.fillStyle = 'rgba(224,106,94,0.55)';
          ctx.fillRect(this.px(0), this.py(this.rows - 0.4), this.cols * cell, (0.4 + MARGIN) * cell);
          break;
        }
      }
      ctx.globalAlpha = 1;
    }
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
