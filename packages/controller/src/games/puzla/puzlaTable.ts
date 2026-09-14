import type { PuzlaFrame, PuzlaGeometry, PuzlaHostData } from '@igra/shared';
import {
  PUZLA_WIRE_SCALE,
  puzlaEdges,
  puzlaPad,
  puzlaPieceCR,
  puzlaRotate,
  tracePuzlaPiece,
} from '@igra/shared';

// Puzla table model + sprite atlas + canvas renderer. The host and the
// controller each carry an IDENTICAL copy of this file (there is no shared DOM
// package) — change one, change both.
//
// Everything here works in table units (see types/puzla.ts). Shapes come from
// the seed via the shared `tracePuzlaPiece`, so the TV and every phone cut the
// picture the same way without a single path point on the wire.

// --- sprites ---------------------------------------------------------------------

export interface PuzlaSprites {
  /** One canvas, one cell per piece — iOS caps total canvas memory, 100 canvases would hit it. */
  atlas: HTMLCanvasElement;
  /** Atlas px per table unit. */
  scale: number;
  /** One sprite cell, px (cell + pad on every side). */
  sw: number;
  sh: number;
  /** Pad in px around the cell, room for the knobs. */
  pad: number;
  /** Outline of each piece in its own sprite's px space. */
  paths: Path2D[];
  /** A context with an identity transform, for isPointInPath. */
  hit: CanvasRenderingContext2D;
}

export function buildPuzlaSprites(
  geo: PuzlaGeometry,
  image: HTMLImageElement,
  maxAtlas: number
): PuzlaSprites {
  const imgW = image.naturalWidth || geo.imageW;
  const imgH = image.naturalHeight || geo.imageH;
  const padU = puzlaPad(geo.pw, geo.ph);
  const frameW = geo.cols * geo.pw;
  const scale = Math.max(
    6,
    Math.min(
      imgW / frameW,
      maxAtlas / (geo.cols * (geo.pw + 2 * padU)),
      maxAtlas / (geo.rows * (geo.ph + 2 * padU))
    )
  );
  const cw = geo.pw * scale;
  const ch = geo.ph * scale;
  const pad = Math.ceil(padU * scale) + 2;
  const sw = Math.ceil(cw + 2 * pad);
  const sh = Math.ceil(ch + 2 * pad);

  const atlas = document.createElement('canvas');
  atlas.width = sw * geo.cols;
  atlas.height = sh * geo.rows;
  const ctx = atlas.getContext('2d')!;
  const edges = puzlaEdges(geo.seed, geo.cols, geo.rows);
  // Image px per sprite px.
  const kx = imgW / (geo.cols * cw);
  const ky = imgH / (geo.rows * ch);
  const paths: Path2D[] = [];

  for (let r = 0; r < geo.rows; r++) {
    for (let c = 0; c < geo.cols; c++) {
      const path = new Path2D();
      tracePuzlaPiece(path, edges, c, r, cw, ch, pad, pad);
      paths.push(path);

      ctx.save();
      ctx.translate(c * sw, r * sh);
      ctx.clip(path);
      // Source rect of the cell plus pad, clamped to the image by hand — a
      // source rect hanging off the image draws nothing at all on some Safari
      // versions instead of being clipped.
      let sx = (c * cw - pad) * kx;
      let sy = (r * ch - pad) * ky;
      let sWidth = sw * kx;
      let sHeight = sh * ky;
      let dx = 0;
      let dy = 0;
      if (sx < 0) {
        dx = -sx / kx;
        sWidth += sx;
        sx = 0;
      }
      if (sy < 0) {
        dy = -sy / ky;
        sHeight += sy;
        sy = 0;
      }
      sWidth = Math.min(sWidth, imgW - sx);
      sHeight = Math.min(sHeight, imgH - sy);
      if (sWidth > 0 && sHeight > 0) {
        ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, sWidth / kx, sHeight / ky);
      }
      ctx.restore();

      // A thin bevel: dark edge plus a faint light one — hides the hairline
      // seams between neighbouring sprites and reads as cardboard.
      ctx.save();
      ctx.translate(c * sw, r * sh);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, Math.min(cw, ch) * 0.02);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.stroke(path);
      ctx.translate(-0.6, -0.6);
      ctx.lineWidth = Math.max(0.6, Math.min(cw, ch) * 0.008);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.stroke(path);
      ctx.restore();
    }
  }

  const hitCanvas = document.createElement('canvas');
  hitCanvas.width = 1;
  hitCanvas.height = 1;
  return { atlas, scale, sw, sh, pad, paths, hit: hitCanvas.getContext('2d')! };
}

// --- model -------------------------------------------------------------------------

export interface LiveGroup {
  id: number;
  /** Drawn position (smoothed toward tx/ty). */
  x: number;
  y: number;
  /** Latest authoritative position. */
  tx: number;
  ty: number;
  rot: number;
  z: number;
  pieces: number[];
  holder: string | null;
}

export const FRAME_GROUP = 0;

export class PuzlaTable {
  geo: PuzlaGeometry | null = null;
  groups = new Map<number, LiveGroup>();
  pieceGroup: number[] = [];
  /** The group this device is dragging — the network never moves it. */
  localGroup: number | null = null;
  /** Bumped on every change; renderers redraw when it moves. */
  version = 0;
  private frameSeq = 0;

  applyState(h: PuzlaHostData): void {
    this.geo = h.geo;
    this.pieceGroup = h.pieceGroup;
    const pieces = new Map<number, number[]>();
    h.pieceGroup.forEach((gid, p) => {
      const list = pieces.get(gid);
      if (list) list.push(p);
      else pieces.set(gid, [p]);
    });

    const next = new Map<number, LiveGroup>();
    for (const [id, xi, yi, rot, z] of h.groups) {
      const prev = this.groups.get(id);
      const x = xi / PUZLA_WIRE_SCALE;
      const y = yi / PUZLA_WIRE_SCALE;
      const g: LiveGroup = {
        id,
        x: prev && prev.rot === rot ? prev.x : x,
        y: prev && prev.rot === rot ? prev.y : y,
        tx: x,
        ty: y,
        rot,
        z,
        pieces: pieces.get(id) ?? [],
        holder: h.holders[String(id)] ?? null,
      };
      if (id === this.localGroup && prev && prev.rot === rot) {
        // Our own finger is the authority while we drag.
        g.x = prev.x;
        g.y = prev.y;
        g.tx = prev.tx;
        g.ty = prev.ty;
      }
      next.set(id, g);
    }
    this.groups = next;
    this.version++;
  }

  applyFrame(frame: PuzlaFrame): void {
    if (frame.seq <= this.frameSeq) return;
    this.frameSeq = frame.seq;
    const held = new Set<number>();
    for (const [id, xi, yi, rot, pid] of frame.held) {
      const g = this.groups.get(id);
      if (!g) continue;
      held.add(id);
      g.holder = pid;
      if (id === this.localGroup) continue;
      g.tx = xi / PUZLA_WIRE_SCALE;
      g.ty = yi / PUZLA_WIRE_SCALE;
      if (g.rot !== rot) {
        g.rot = rot;
        g.x = g.tx;
        g.y = g.ty;
      }
    }
    for (const g of this.groups.values()) {
      if (g.holder && !held.has(g.id)) g.holder = null;
    }
    this.version++;
  }

  /** Ease drawn positions toward the authoritative ones. Returns true while anything is moving. */
  step(dtMs: number): boolean {
    const k = 1 - Math.exp(-dtMs / 70);
    let moving = false;
    for (const g of this.groups.values()) {
      const dx = g.tx - g.x;
      const dy = g.ty - g.y;
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) < 1e-5 && Math.abs(dy) < 1e-5) {
        g.x = g.tx;
        g.y = g.ty;
      } else {
        g.x += dx * k;
        g.y += dy * k;
      }
      moving = true;
    }
    return moving;
  }

  /** Groups in draw order: the frame first, loose ones by z, held ones on top. */
  ordered(): LiveGroup[] {
    return [...this.groups.values()].sort((a, b) => {
      if (a.id === FRAME_GROUP) return -1;
      if (b.id === FRAME_GROUP) return 1;
      const ha = a.holder || a.id === this.localGroup ? 1 : 0;
      const hb = b.holder || b.id === this.localGroup ? 1 : 0;
      return ha - hb || a.z - b.z;
    });
  }

  /**
   * Topmost piece under a table-space point, or null. `slop` (table units)
   * widens the test to the nearest piece centre when the finger lands on a gap.
   */
  pick(sprites: PuzlaSprites, x: number, y: number, slop = 0): { groupId: number; piece: number } | null {
    const geo = this.geo;
    if (!geo) return null;
    const order = this.ordered();
    for (let i = order.length - 1; i >= 0; i--) {
      const g = order[i];
      if (g.id === FRAME_GROUP) continue;
      const local = puzlaRotate(x - g.x, y - g.y, -g.rot);
      for (const p of g.pieces) {
        const { c, r } = puzlaPieceCR(geo, p);
        const sx = (local.x - c * geo.pw) * sprites.scale + sprites.pad;
        const sy = (local.y - r * geo.ph) * sprites.scale + sprites.pad;
        if (sx < 0 || sy < 0 || sx > sprites.sw || sy > sprites.sh) continue;
        if (sprites.hit.isPointInPath(sprites.paths[p], sx, sy)) return { groupId: g.id, piece: p };
      }
    }
    if (slop <= 0) return null;
    let best: { groupId: number; piece: number; d: number } | null = null;
    for (let i = order.length - 1; i >= 0; i--) {
      const g = order[i];
      if (g.id === FRAME_GROUP) continue;
      for (const p of g.pieces) {
        const { c, r } = puzlaPieceCR(geo, p);
        const v = puzlaRotate((c + 0.5) * geo.pw, (r + 0.5) * geo.ph, g.rot);
        const d = Math.hypot(g.x + v.x - x, g.y + v.y - y);
        if (d <= slop && (!best || d < best.d)) best = { groupId: g.id, piece: p, d };
      }
    }
    return best ? { groupId: best.groupId, piece: best.piece } : null;
  }
}

// --- renderer ----------------------------------------------------------------------

export interface PuzlaView {
  /** CSS px per table unit. */
  scale: number;
  /** CSS px of table origin. */
  ox: number;
  oy: number;
}

export interface PuzlaFlash {
  x: number;
  y: number;
  color: string;
  startedAt: number;
  kind: 'spoj' | 'ram';
}

export interface PuzlaDrawOptions {
  /** playerId → avatar colour, for holder outlines. */
  colors: Record<string, string>;
  /** playerId → name, drawn as a tag over held groups (TV). */
  names?: Record<string, string>;
  /** This device's player — its own hold is outlined in gold, not its avatar colour. */
  selfId?: string | null;
  flashes: PuzlaFlash[];
  now: number;
}

export const PUZLA_FLASH_MS = 750;

export function drawPuzlaTable(
  ctx: CanvasRenderingContext2D,
  table: PuzlaTable,
  sprites: PuzlaSprites | null,
  view: PuzlaView,
  opts: PuzlaDrawOptions
): void {
  const geo = table.geo;
  if (!geo) return;
  const s = view.scale;

  // Table felt.
  ctx.save();
  ctx.translate(view.ox, view.oy);
  const felt = ctx.createLinearGradient(0, 0, 0, geo.tableH * s);
  felt.addColorStop(0, '#16304f');
  felt.addColorStop(1, '#10243d');
  ctx.fillStyle = felt;
  roundRect(ctx, 0, 0, geo.tableW * s, geo.tableH * s, Math.min(18, s * 0.02));
  ctx.fill();

  // Frame.
  const fx = geo.frameX * s;
  const fy = geo.frameY * s;
  const fw = geo.cols * geo.pw * s;
  const fh = geo.rows * geo.ph * s;
  ctx.fillStyle = 'rgba(5, 12, 24, 0.55)';
  ctx.fillRect(fx, fy, fw, fh);
  ctx.setLineDash([Math.max(4, s * 0.008), Math.max(4, s * 0.008)]);
  ctx.lineWidth = Math.max(1, s * 0.0025);
  ctx.strokeStyle = 'rgba(194, 155, 71, 0.55)';
  ctx.strokeRect(fx, fy, fw, fh);
  ctx.setLineDash([]);
  ctx.restore();

  if (!sprites) return;

  const padU = sprites.pad / sprites.scale;
  const spriteWU = sprites.sw / sprites.scale;
  const spriteHU = sprites.sh / sprites.scale;

  for (const g of table.ordered()) {
    if (g.pieces.length === 0) continue;
    const held = g.holder !== null || g.id === table.localGroup;
    ctx.save();
    ctx.translate(view.ox + g.x * s, view.oy + g.y * s);
    ctx.rotate((g.rot * Math.PI) / 2);
    ctx.scale(s, s);
    if (held) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
    }
    for (const p of g.pieces) {
      const { c, r } = puzlaPieceCR(geo, p);
      ctx.drawImage(
        sprites.atlas,
        c * sprites.sw,
        r * sprites.sh,
        sprites.sw,
        sprites.sh,
        c * geo.pw - padU,
        r * geo.ph - padU,
        spriteWU,
        spriteHU
      );
    }
    if (held) {
      ctx.shadowColor = 'transparent';
      const holder = g.id === table.localGroup ? opts.selfId ?? null : g.holder;
      const color =
        holder && holder === opts.selfId ? '#F2CE74' : (holder && opts.colors[holder]) || '#F2CE74';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.2 * sprites.scale / s;
      for (const p of g.pieces) {
        const { c, r } = puzlaPieceCR(geo, p);
        ctx.save();
        ctx.translate(c * geo.pw - padU, r * geo.ph - padU);
        ctx.scale(1 / sprites.scale, 1 / sprites.scale);
        ctx.stroke(sprites.paths[p]);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // Name tags over other players' holds (TV only passes names).
  if (opts.names) {
    for (const g of table.groups.values()) {
      if (!g.holder || g.pieces.length === 0) continue;
      const name = opts.names[g.holder];
      if (!name) continue;
      let minY = Infinity;
      let sumX = 0;
      for (const p of g.pieces) {
        const { c, r } = puzlaPieceCR(geo, p);
        const v = puzlaRotate((c + 0.5) * geo.pw, (r + 0.5) * geo.ph, g.rot);
        sumX += g.x + v.x;
        minY = Math.min(minY, g.y + v.y);
      }
      const cx = view.ox + (sumX / g.pieces.length) * s;
      const cy = view.oy + (minY - Math.max(geo.pw, geo.ph) * 0.75) * s;
      drawTag(ctx, name, cx, cy, opts.colors[g.holder] ?? '#F2CE74');
    }
  }

  // Join / lock flashes.
  for (const f of opts.flashes) {
    const t = (opts.now - f.startedAt) / PUZLA_FLASH_MS;
    if (t < 0 || t > 1) continue;
    const radius = Math.max(geo.pw, geo.ph) * s * (0.4 + t * (f.kind === 'ram' ? 1.4 : 0.9));
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.lineWidth = Math.max(2, s * 0.006) * (1 - t * 0.6);
    ctx.strokeStyle = f.kind === 'ram' ? '#F2CE74' : f.color;
    ctx.beginPath();
    ctx.arc(view.ox + f.x * s, view.oy + f.y * s, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTag(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, color: string): void {
  ctx.save();
  ctx.font = '700 15px Manrope, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 18;
  const h = 24;
  ctx.fillStyle = 'rgba(11, 28, 51, 0.85)';
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 12);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = '#F5EBE0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}

/** Fit the whole table into a box, centred. */
export function fitPuzlaView(geo: PuzlaGeometry, width: number, height: number, margin = 0): PuzlaView {
  const scale = Math.min((width - margin * 2) / geo.tableW, (height - margin * 2) / geo.tableH);
  return {
    scale,
    ox: (width - geo.tableW * scale) / 2,
    oy: (height - geo.tableH * scale) / 2,
  };
}

/** Load an image once; resolves after decode so sprites never cut a blank bitmap. */
export function loadPuzlaImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (typeof img.decode === 'function') img.decode().then(() => resolve(img), () => resolve(img));
      else resolve(img);
    };
    img.onerror = () => reject(new Error('slika se nije učitala'));
    img.src = url;
  });
}
