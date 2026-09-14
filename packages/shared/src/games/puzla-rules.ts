// Puzla — pure geometry, layout and scoring constants shared by the server
// module, the headless test and both renderers. No DOM here: tracing goes into
// a `PuzlaPathSink`, which Path2D and CanvasRenderingContext2D both satisfy.

import type { PuzlaGeometry, PuzlaMode } from '../types/puzla.js';

export const PUZLA_PIECE_OPTIONS = [16, 36, 64, 100] as const;
export const PUZLA_PIECE_DEFAULT = 36;
export const PUZLA_MAX_PLAYERS = 8;

export const PUZLA_TABLE_W = 1.6;
export const PUZLA_TABLE_H = 0.9;

/** Server tick; exactly one positional frame per tick while something is held. */
export const PUZLA_TICK_MS = 66;
/** Wire scale for table coordinates — 1e-4 of a table unit is ~0.1px on a TV. */
export const PUZLA_WIRE_SCALE = 10000;

/** Snap distance as a fraction of the smaller cell side. */
export const PUZLA_SNAP_FACTOR = 0.35;
/** A hold with no movement for this long is released where it lies — no snap. */
export const PUZLA_IDLE_RELEASE_MS = 10_000;

/**
 * Upload budget. Over HTTP long-polling socket.io base64-encodes binary (+33%),
 * and anything past the server's 512KB `maxHttpBufferSize` kills the transport
 * without an ack — so the phone re-encodes below the client target and the
 * server refuses above the hard cap, both well clear of that line.
 */
export const PUZLA_CLIENT_TARGET_BYTES = 340_000;
export const PUZLA_MAX_UPLOAD_BYTES = 360_000;
export const PUZLA_MAX_IMAGE_EDGE = 1600;
/** Aspect ratios outside 1:3 … 3:1 are refused — the pieces would be slivers. */
export const PUZLA_MAX_ASPECT = 3;

export const PUZLA_POINTS_PER_PAIR = 5;
export const PUZLA_POINTS_LOCK = 10;
export const PUZLA_POINTS_COMPLETE = 100;
/** Top of the time bonus in `vreme`, paid in proportion to the time left. */
export const PUZLA_POINTS_TIME_MAX = 200;

/** Active-input deadlines (gameplay balance — not admin-tunable). */
const PUZLA_SECONDS_BY_PIECES: Record<number, number> = {
  16: 240,
  36: 420,
  64: 720,
  100: 1080,
};

export function clampPuzlaPieces(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return PUZLA_PIECE_DEFAULT;
  let best: number = PUZLA_PIECE_OPTIONS[0];
  for (const opt of PUZLA_PIECE_OPTIONS) {
    if (Math.abs(opt - n) < Math.abs(best - n)) best = opt;
  }
  return best;
}

export function clampPuzlaMode(raw: unknown): PuzlaMode {
  return raw === 'opusteno' ? 'opusteno' : 'vreme';
}

export function puzlaTimeLimitSeconds(pieces: number, rotation: boolean): number {
  const base = PUZLA_SECONDS_BY_PIECES[clampPuzlaPieces(pieces)];
  return Math.round(base * (rotation ? 1.5 : 1));
}

/** cols × rows closest to `pieces` with cells as square as the aspect allows. */
export function puzlaGrid(pieces: number, aspect: number): { cols: number; rows: number } {
  const cols = Math.max(2, Math.round(Math.sqrt(pieces * aspect)));
  const rows = Math.max(2, Math.round(pieces / cols));
  return { cols, rows };
}

// --- seeded randomness ---------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- rotation --------------------------------------------------------------------

/** Rotate a vector by `rot` quarter turns clockwise (screen space, y down). */
export function puzlaRotate(x: number, y: number, rot: number): { x: number; y: number } {
  switch (((rot % 4) + 4) % 4) {
    case 1:
      return { x: -y, y: x };
    case 2:
      return { x: -x, y: -y };
    case 3:
      return { x: y, y: -x };
    default:
      return { x, y };
  }
}

export function puzlaPieceCR(geo: PuzlaGeometry, piece: number): { c: number; r: number } {
  return { c: piece % geo.cols, r: Math.floor(piece / geo.cols) };
}

/** Centre of piece `piece` for a group whose origin is (ox, oy) at `rot`. */
export function puzlaPieceCenter(
  geo: PuzlaGeometry,
  ox: number,
  oy: number,
  rot: number,
  piece: number
): { x: number; y: number } {
  const { c, r } = puzlaPieceCR(geo, piece);
  const v = puzlaRotate((c + 0.5) * geo.pw, (r + 0.5) * geo.ph, rot);
  return { x: ox + v.x, y: oy + v.y };
}

export function puzlaIsBorderPiece(geo: PuzlaGeometry, piece: number): boolean {
  const { c, r } = puzlaPieceCR(geo, piece);
  return c === 0 || r === 0 || c === geo.cols - 1 || r === geo.rows - 1;
}

/** Grid neighbours of a piece (up to four). */
export function puzlaNeighbours(geo: PuzlaGeometry, piece: number): number[] {
  const { c, r } = puzlaPieceCR(geo, piece);
  const out: number[] = [];
  if (r > 0) out.push(piece - geo.cols);
  if (r < geo.rows - 1) out.push(piece + geo.cols);
  if (c > 0) out.push(piece - 1);
  if (c < geo.cols - 1) out.push(piece + 1);
  return out;
}

export function puzlaSnapDistance(geo: PuzlaGeometry): number {
  return Math.min(geo.pw, geo.ph) * PUZLA_SNAP_FACTOR;
}

/**
 * Keep a group on the table: the bounding box of its piece centres must stay
 * inside it. Server and phone run the same clamp, so an optimistic drag never
 * disagrees with where the server puts the group.
 */
export function puzlaClampOrigin(
  geo: PuzlaGeometry,
  x: number,
  y: number,
  rot: number,
  pieces: readonly number[]
): { x: number; y: number } {
  if (pieces.length === 0) return { x, y };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pieces) {
    const cc = puzlaPieceCenter(geo, 0, 0, rot, p);
    if (cc.x < minX) minX = cc.x;
    if (cc.x > maxX) maxX = cc.x;
    if (cc.y < minY) minY = cc.y;
    if (cc.y > maxY) maxY = cc.y;
  }
  const clampAxis = (v: number, min: number, max: number, size: number) => {
    const lo = -min;
    const hi = size - max;
    if (lo > hi) return (lo + hi) / 2;
    return Math.max(lo, Math.min(hi, v));
  };
  return {
    x: clampAxis(x, minX, maxX, geo.tableW),
    y: clampAxis(y, minY, maxY, geo.tableH),
  };
}

// --- tab edges -------------------------------------------------------------------

/**
 * One internal edge. `s` = ±1 is the side the knob bulges to (+1 toward the
 * higher row / column); a…e jitter the curve so no two edges look alike.
 */
export interface PuzlaEdge {
  s: number;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
}

export interface PuzlaEdges {
  cols: number;
  rows: number;
  /** Between (c,r) and (c,r+1): index r·cols + c, r < rows−1. */
  h: PuzlaEdge[];
  /** Between (c,r) and (c+1,r): index r·(cols−1) + c, c < cols−1. */
  v: PuzlaEdge[];
}

const TAB = 0.1;
const JITTER = 0.035;

/** Deterministic from the seed — every client derives the same cut. */
export function puzlaEdges(seed: number, cols: number, rows: number): PuzlaEdges {
  const rnd = mulberry32(seed);
  const make = (): PuzlaEdge => {
    const u = (k: number) => (rnd() * 2 - 1) * k;
    return {
      s: rnd() < 0.5 ? -1 : 1,
      a: u(JITTER / 2),
      b: u(JITTER),
      c: u(JITTER),
      d: u(JITTER),
      e: u(JITTER / 2),
    };
  };
  const h: PuzlaEdge[] = [];
  for (let i = 0; i < (rows - 1) * cols; i++) h.push(make());
  const v: PuzlaEdge[] = [];
  for (let i = 0; i < rows * (cols - 1); i++) v.push(make());
  return { cols, rows, h, v };
}

/** Anything a jigsaw outline can be traced into — Path2D and a 2D context both fit. */
export interface PuzlaPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): void;
  closePath(): void;
}

/** The ten control points of an edge in (along, across) units. */
function edgeUV(e: PuzlaEdge): [number, number][] {
  const t = TAB;
  return [
    [0, 0],
    [0.2, e.a],
    [0.5 + e.b + e.d, -t + e.c],
    [0.5 - t + e.b, t + e.c],
    [0.5 - 2 * t + e.b - e.d, 3 * t + e.c],
    [0.5 + 2 * t + e.b - e.d, 3 * t + e.c],
    [0.5 + t + e.b, t + e.c],
    [0.5 + e.b + e.d, -t + e.c],
    [0.8, e.e],
    [1, 0],
  ];
}

/**
 * Trace one piece's outline, clockwise, with cell (c,r)'s top-left at (ox, oy)
 * and a cell of pw × ph. A shared edge is stored once; the piece on its far
 * side walks the very same points backwards, so neighbours fit exactly.
 *
 * Knob depth is scaled by min(pw, ph) on both axes so a tab looks the same on
 * a horizontal and a vertical edge; it reaches at most 0.335·that — see
 * `puzlaPad`.
 */
export function tracePuzlaPiece(
  sink: PuzlaPathSink,
  edges: PuzlaEdges,
  c: number,
  r: number,
  pw: number,
  ph: number,
  ox = 0,
  oy = 0
): void {
  const { cols, rows } = edges;
  const S = Math.min(pw, ph);

  // One edge from (x0,y0) along (dx,dy) of length L, knob toward +normal.
  const run = (
    edge: PuzlaEdge | null,
    x0: number,
    y0: number,
    dx: number,
    dy: number,
    nx: number,
    ny: number,
    L: number,
    reverse: boolean
  ) => {
    if (!edge) {
      const end = reverse ? { x: x0, y: y0 } : { x: x0 + dx * L, y: y0 + dy * L };
      sink.lineTo(end.x, end.y);
      return;
    }
    const pts = edgeUV(edge).map(([u, v]) => ({
      x: x0 + dx * u * L + nx * v * S * edge.s,
      y: y0 + dy * u * L + ny * v * S * edge.s,
    }));
    if (reverse) pts.reverse();
    sink.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
    sink.bezierCurveTo(pts[4].x, pts[4].y, pts[5].x, pts[5].y, pts[6].x, pts[6].y);
    sink.bezierCurveTo(pts[7].x, pts[7].y, pts[8].x, pts[8].y, pts[9].x, pts[9].y);
  };

  const left = ox;
  const top = oy;
  const right = ox + pw;
  const bottom = oy + ph;

  const topEdge = r > 0 ? edges.h[(r - 1) * cols + c] : null;
  const bottomEdge = r < rows - 1 ? edges.h[r * cols + c] : null;
  const leftEdge = c > 0 ? edges.v[r * (cols - 1) + (c - 1)] : null;
  const rightEdge = c < cols - 1 ? edges.v[r * (cols - 1) + c] : null;

  sink.moveTo(left, top);
  // Canonical edge directions: horizontal edges run left→right, vertical ones
  // top→bottom, both with the normal pointing to the higher index.
  run(topEdge, left, top, 1, 0, 0, 1, pw, false);
  run(rightEdge, right, top, 0, 1, 1, 0, ph, false);
  run(bottomEdge, left, bottom, 1, 0, 0, 1, pw, true);
  run(leftEdge, left, top, 0, 1, 1, 0, ph, true);
  sink.closePath();
}

/** How far a knob can reach outside its cell, in the same units as pw/ph. */
export function puzlaPad(pw: number, ph: number): number {
  return Math.min(pw, ph) * 0.34;
}

// --- layout ----------------------------------------------------------------------

/**
 * Size the frame for the table, then shrink it until there are enough free
 * slots around it for every piece to lie loose. The frame alone at a fixed
 * share of the table would leave 100 pieces piled on top of each other.
 */
export function puzlaBuildGeometry(
  seed: number,
  pieces: number,
  imageW: number,
  imageH: number,
  rotation: boolean
): PuzlaGeometry {
  const aspect = imageW / imageH;
  const { cols, rows } = puzlaGrid(pieces, aspect);
  const W = PUZLA_TABLE_W;
  const H = PUZLA_TABLE_H;

  // Start at ~36% of the table's area, capped to fit inside it.
  let frameW = Math.sqrt(0.36 * W * H * aspect);
  let frameH = frameW / aspect;
  const fit = Math.min(1, (W * 0.9) / frameW, (H * 0.9) / frameH);
  frameW *= fit;
  frameH *= fit;

  for (let i = 0; i < 40; i++) {
    const geo = makeGeo(seed, cols, rows, imageW, imageH, frameW, frameH);
    if (puzlaSlots(geo, rotation).length >= cols * rows) return geo;
    frameW *= 0.93;
    frameH *= 0.93;
  }
  return makeGeo(seed, cols, rows, imageW, imageH, frameW, frameH);
}

function makeGeo(
  seed: number,
  cols: number,
  rows: number,
  imageW: number,
  imageH: number,
  frameW: number,
  frameH: number
): PuzlaGeometry {
  return {
    seed,
    cols,
    rows,
    imageW,
    imageH,
    tableW: PUZLA_TABLE_W,
    tableH: PUZLA_TABLE_H,
    frameX: (PUZLA_TABLE_W - frameW) / 2,
    frameY: (PUZLA_TABLE_H - frameH) / 2,
    pw: frameW / cols,
    ph: frameH / rows,
  };
}

/** Free spots on the table outside the frame, one loose piece each. */
function puzlaSlots(geo: PuzlaGeometry, rotation: boolean): { x: number; y: number }[] {
  const big = Math.max(geo.pw, geo.ph);
  const sx = (rotation ? big : geo.pw) * 1.32;
  const sy = (rotation ? big : geo.ph) * 1.32;
  const margin = Math.min(geo.pw, geo.ph) * 0.15;
  const fx0 = geo.frameX - margin;
  const fy0 = geo.frameY - margin;
  const fx1 = geo.frameX + geo.cols * geo.pw + margin;
  const fy1 = geo.frameY + geo.rows * geo.ph + margin;

  const nx = Math.floor(geo.tableW / sx);
  const ny = Math.floor(geo.tableH / sy);
  const offX = (geo.tableW - nx * sx) / 2;
  const offY = (geo.tableH - ny * sy) / 2;
  const out: { x: number; y: number }[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = offX + i * sx;
      const y0 = offY + j * sy;
      const overlaps = x0 < fx1 && x0 + sx > fx0 && y0 < fy1 && y0 + sy > fy0;
      if (!overlaps) out.push({ x: x0 + sx / 2, y: y0 + sy / 2 });
    }
  }
  return out;
}

export interface PuzlaScatteredPiece {
  piece: number;
  /** Group origin for a one-piece group. */
  x: number;
  y: number;
  rot: number;
}

/** Deal every piece to its own slot, seeded, optionally rotated. */
export function puzlaScatter(geo: PuzlaGeometry, rotation: boolean): PuzlaScatteredPiece[] {
  const rnd = mulberry32((geo.seed ^ 0x9e3779b9) >>> 0);
  const slots = puzlaSlots(geo, rotation);
  // Fisher–Yates with the seeded generator.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const total = geo.cols * geo.rows;
  const jitter = Math.min(geo.pw, geo.ph) * 0.12;
  const out: PuzlaScatteredPiece[] = [];
  for (let piece = 0; piece < total; piece++) {
    // If a pathological aspect left too few slots, pile the rest on the table
    // edges rather than dropping pieces.
    const slot = slots[piece % Math.max(1, slots.length)] ?? {
      x: geo.tableW * rnd(),
      y: geo.tableH * rnd(),
    };
    const rot = rotation ? Math.floor(rnd() * 4) : 0;
    const cx = slot.x + (rnd() * 2 - 1) * jitter;
    const cy = slot.y + (rnd() * 2 - 1) * jitter;
    const { c, r } = puzlaPieceCR(geo, piece);
    const v = puzlaRotate((c + 0.5) * geo.pw, (r + 0.5) * geo.ph, rot);
    out.push({ piece, x: cx - v.x, y: cy - v.y, rot });
  }
  return out;
}
