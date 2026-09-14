import { puzlaClampOrigin } from '@igra/shared';
import {
  FRAME_GROUP,
  PUZLA_FLASH_MS,
  drawPuzlaTable,
  fitPuzlaView,
  type PuzlaFlash,
  type PuzlaSprites,
  type PuzlaTable,
  type PuzlaView,
} from './puzlaTable';

/** Movement (CSS px) past which a touch is a drag or a pan, not a tap. */
const TAP_PX = 9;
/** A finger that lands on a gap still picks the nearest piece within this. */
const SLOP_PX = 16;
/** Dragging within this of the screen edge scrolls the table. */
const EDGE_PX = 46;
const EDGE_SPEED = 560;
const MAX_ZOOM = 7;

export interface PuzlaStageCallbacks {
  onGrab: (groupId: number) => void;
  onMove: (groupId: number, x: number, y: number) => void;
  onDrop: (groupId: number, x: number, y: number) => void;
  onRotate: (groupId: number, piece: number) => void;
  /** Touched a piece someone else is holding. */
  onBlocked: () => void;
}

type Gesture =
  | { kind: 'idle' }
  | { kind: 'pending'; pointerId: number; sx: number; sy: number; hit: { groupId: number; piece: number } | null }
  | { kind: 'drag'; pointerId: number; groupId: number; offX: number; offY: number; lastX: number; lastY: number }
  | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
  | { kind: 'pinch'; startDist: number; startScale: number; worldX: number; worldY: number };

/**
 * The phone's view of the Puzla table: camera, gestures, hit testing, drawing.
 *
 * Plain canvas + pointer events, no React in the hot path — a finger drag
 * would otherwise re-render the tree per pointermove. Gesture grammar:
 * - one finger on a piece → drag it (the grab goes out once it actually moves);
 * - a tap on a piece → rotate it (rotation mode only);
 * - one finger on empty table → pan;
 * - a second finger → drop whatever is held, then pinch-zoom about the midpoint.
 * Pinch math is BitkaMapPicker's (keep the content point under the midpoint
 * fixed), on a canvas transform instead of a CSS one.
 */
export class PuzlaStage {
  private ctx: CanvasRenderingContext2D | null;
  private raf = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private view: PuzlaView = { scale: 1, ox: 0, oy: 0 };
  private viewReady = false;
  private sprites: PuzlaSprites | null = null;
  private colors: Record<string, string> = {};
  private flashes: PuzlaFlash[] = [];
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture = { kind: 'idle' };
  private interactive = true;
  private dirty = true;
  private lastVersion = -1;
  private last = performance.now();
  private observer: ResizeObserver;

  constructor(
    private canvas: HTMLCanvasElement,
    private table: PuzlaTable,
    private selfId: string,
    private rotation: boolean,
    private cb: PuzlaStageCallbacks
  ) {
    this.ctx = canvas.getContext('2d');
    this.loop = this.loop.bind(this);
    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    this.observer = new ResizeObserver(() => this.resize());
    if (canvas.parentElement) this.observer.observe(canvas.parentElement);
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  setSprites(sprites: PuzlaSprites | null): void {
    this.sprites = sprites;
    this.dirty = true;
  }

  setColors(colors: Record<string, string>): void {
    this.colors = colors;
    this.dirty = true;
  }

  setInteractive(on: boolean): void {
    this.interactive = on;
    if (!on && this.gesture.kind === 'drag') this.finishDrag();
  }

  addFlash(flash: PuzlaFlash): void {
    this.flashes.push(flash);
  }

  /** Drop the drag silently — the server gave the piece to someone else. */
  cancelDrag(): void {
    if (this.gesture.kind === 'drag') this.gesture = { kind: 'idle' };
  }

  fitTable(): void {
    const geo = this.table.geo;
    if (!geo || this.w === 0) return;
    this.view = fitPuzlaView(geo, this.w, this.h, 10);
    this.viewReady = true;
    this.dirty = true;
  }

  zoomToFrame(): void {
    const geo = this.table.geo;
    if (!geo || this.w === 0) return;
    const fw = geo.cols * geo.pw;
    const fh = geo.rows * geo.ph;
    const scale = Math.min(this.maxScale(), (this.w * 0.94) / fw, (this.h * 0.72) / fh);
    this.view = {
      scale,
      ox: this.w / 2 - (geo.frameX + fw / 2) * scale,
      oy: this.h / 2 - (geo.frameY + fh / 2) * scale,
    };
    this.clampView();
    this.viewReady = true;
    this.dirty = true;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.ctx = null;
  }

  // --- camera ------------------------------------------------------------------

  private resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = rect?.width ?? window.innerWidth;
    this.h = rect?.height ?? window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(this.w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * this.dpr));
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    if (this.viewReady) this.clampView();
    this.dirty = true;
  }

  private fitScale(): number {
    const geo = this.table.geo;
    if (!geo) return 1;
    return fitPuzlaView(geo, this.w, this.h, 10).scale;
  }

  private minScale(): number {
    return this.fitScale() * 0.85;
  }

  private maxScale(): number {
    return this.fitScale() * MAX_ZOOM;
  }

  private clampView(): void {
    const geo = this.table.geo;
    if (!geo) return;
    const s = this.view.scale;
    const margin = 48;
    const axis = (o: number, size: number, viewport: number) =>
      size + margin * 2 <= viewport
        ? (viewport - size) / 2
        : Math.min(margin, Math.max(viewport - size - margin, o));
    this.view.ox = axis(this.view.ox, geo.tableW * s, this.w);
    this.view.oy = axis(this.view.oy, geo.tableH * s, this.h);
  }

  private toWorld(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.view.ox) / this.view.scale, y: (py - this.view.oy) / this.view.scale };
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // --- gestures ------------------------------------------------------------------

  private canGrab(groupId: number): boolean {
    const g = this.table.groups.get(groupId);
    return !!g && groupId !== FRAME_GROUP && (!g.holder || g.holder === this.selfId);
  }

  private onDown(e: PointerEvent): void {
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size === 1) {
      const world = this.toWorld(p.x, p.y);
      const hit =
        this.interactive && this.sprites
          ? this.table.pick(this.sprites, world.x, world.y, SLOP_PX / this.view.scale)
          : null;
      this.gesture = { kind: 'pending', pointerId: e.pointerId, sx: p.x, sy: p.y, hit };
    } else if (this.pointers.size === 2) {
      if (this.gesture.kind === 'drag') this.finishDrag();
      const [a, b] = [...this.pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const world = this.toWorld(mid.x, mid.y);
      this.gesture = {
        kind: 'pinch',
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startScale: this.view.scale,
        worldX: world.x,
        worldY: world.y,
      };
    }
  }

  private onMove(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.local(e);
    const prev = this.pointers.get(e.pointerId)!;
    this.pointers.set(e.pointerId, p);
    const g = this.gesture;

    if (g.kind === 'pinch') {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const scale = Math.max(this.minScale(), Math.min(this.maxScale(), g.startScale * (dist / g.startDist)));
      this.view = { scale, ox: mid.x - g.worldX * scale, oy: mid.y - g.worldY * scale };
      this.clampView();
      this.dirty = true;
      return;
    }

    if (g.kind === 'pending' && g.pointerId === e.pointerId) {
      if (Math.hypot(p.x - g.sx, p.y - g.sy) <= TAP_PX) return;
      if (g.hit && this.canGrab(g.hit.groupId)) {
        this.startDrag(g.hit.groupId, g.sx, g.sy, e.pointerId);
        this.updateDrag(p.x, p.y);
      } else {
        if (g.hit) this.cb.onBlocked();
        this.gesture = { kind: 'pan', pointerId: e.pointerId, lastX: prev.x, lastY: prev.y };
        this.panBy(p.x - prev.x, p.y - prev.y);
      }
      return;
    }

    if (g.kind === 'drag' && g.pointerId === e.pointerId) {
      this.updateDrag(p.x, p.y);
      return;
    }

    if (g.kind === 'pan' && g.pointerId === e.pointerId) {
      this.panBy(p.x - g.lastX, p.y - g.lastY);
      g.lastX = p.x;
      g.lastY = p.y;
    }
  }

  private onUp(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const g = this.gesture;

    if (g.kind === 'drag' && g.pointerId === e.pointerId) {
      this.finishDrag();
    } else if (g.kind === 'pending' && g.pointerId === e.pointerId) {
      if (e.type === 'pointerup' && g.hit && this.rotation && this.canGrab(g.hit.groupId)) {
        this.cb.onRotate(g.hit.groupId, g.hit.piece);
      }
      this.gesture = { kind: 'idle' };
    } else if (g.kind === 'pinch' && this.pointers.size === 1) {
      // Two fingers to one: re-anchor, or the table jumps.
      const [id, rest] = [...this.pointers.entries()][0];
      this.gesture = { kind: 'pan', pointerId: id, lastX: rest.x, lastY: rest.y };
    }
    if (this.pointers.size === 0) this.gesture = { kind: 'idle' };
  }

  private panBy(dx: number, dy: number): void {
    this.view.ox += dx;
    this.view.oy += dy;
    this.clampView();
    this.dirty = true;
  }

  private startDrag(groupId: number, sx: number, sy: number, pointerId: number): void {
    const group = this.table.groups.get(groupId);
    if (!group) return;
    const world = this.toWorld(sx, sy);
    let maxZ = 0;
    for (const other of this.table.groups.values()) maxZ = Math.max(maxZ, other.z);
    group.z = maxZ + 1;
    this.table.localGroup = groupId;
    this.gesture = {
      kind: 'drag',
      pointerId,
      groupId,
      offX: world.x - group.x,
      offY: world.y - group.y,
      lastX: sx,
      lastY: sy,
    };
    this.cb.onGrab(groupId);
  }

  private updateDrag(px: number, py: number): void {
    const g = this.gesture;
    const geo = this.table.geo;
    if (g.kind !== 'drag' || !geo) return;
    g.lastX = px;
    g.lastY = py;
    const group = this.table.groups.get(g.groupId);
    if (!group) return;
    const world = this.toWorld(px, py);
    const at = puzlaClampOrigin(geo, world.x - g.offX, world.y - g.offY, group.rot, group.pieces);
    group.x = group.tx = at.x;
    group.y = group.ty = at.y;
    this.table.version++;
    this.cb.onMove(g.groupId, at.x, at.y);
  }

  private finishDrag(): void {
    const g = this.gesture;
    if (g.kind !== 'drag') return;
    const group = this.table.groups.get(g.groupId);
    this.gesture = { kind: 'idle' };
    // `localGroup` stays set until the server confirms — see PuzlaController.
    if (group) this.cb.onDrop(g.groupId, group.x, group.y);
  }

  // --- loop --------------------------------------------------------------------------

  private loop(now: number): void {
    this.raf = requestAnimationFrame(this.loop);
    const ctx = this.ctx;
    if (!ctx || this.w === 0) return;
    const dt = Math.min(100, now - this.last);
    this.last = now;

    if (!this.viewReady && this.table.geo) this.fitTable();

    // Edge scroll while dragging near the border.
    const g = this.gesture;
    if (g.kind === 'drag') {
      const edge = (pos: number, size: number) =>
        pos < EDGE_PX ? 1 - pos / EDGE_PX : pos > size - EDGE_PX ? -(1 - (size - pos) / EDGE_PX) : 0;
      const vx = edge(g.lastX, this.w) * EDGE_SPEED;
      const vy = edge(g.lastY, this.h) * EDGE_SPEED;
      if (vx !== 0 || vy !== 0) {
        const before = { ox: this.view.ox, oy: this.view.oy };
        this.panBy((vx * dt) / 1000, (vy * dt) / 1000);
        if (before.ox !== this.view.ox || before.oy !== this.view.oy) this.updateDrag(g.lastX, g.lastY);
      }
    }

    const moving = this.table.step(dt);
    this.flashes = this.flashes.filter((f) => now - f.startedAt < PUZLA_FLASH_MS);
    if (!this.dirty && !moving && this.table.version === this.lastVersion && this.flashes.length === 0) {
      return;
    }
    this.dirty = false;
    this.lastVersion = this.table.version;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    drawPuzlaTable(ctx, this.table, this.sprites, this.view, {
      colors: this.colors,
      selfId: this.selfId,
      flashes: this.flashes,
      now,
    });
  }
}
