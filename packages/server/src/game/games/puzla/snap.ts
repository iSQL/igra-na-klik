import type { PuzlaGeometry } from '@igra/shared';
import {
  puzlaIsBorderPiece,
  puzlaNeighbours,
  puzlaSnapDistance,
} from '@igra/shared';

/**
 * Puzla snapping as a pure function over the board — no sockets, no rooms, so
 * the headless test can drive it directly.
 *
 * The whole model rests on one fact: a group's position is the world position
 * of its GRID ORIGIN, so pieces sit correctly relative to each other exactly
 * when their groups share origin and rotation. Snapping never needs shapes —
 * only "are the origins close, and do these groups touch on the grid".
 */

export interface PuzlaGroup {
  id: number;
  x: number;
  y: number;
  rot: number;
  z: number;
  pieces: number[];
}

export interface PuzlaBoard {
  geo: PuzlaGeometry;
  /** Group 0 is the frame: origin = frame origin, rot 0, holds every locked piece. */
  groups: Map<number, PuzlaGroup>;
  /** piece index → group id */
  pieceGroup: number[];
}

export interface PuzlaDropResult {
  /** The group the dropped pieces ended up in. */
  groupId: number;
  /** Merges performed (0 = the drop changed nothing). */
  merges: number;
  /** New grid-neighbour pairs created — the per-player credit. */
  pairs: number;
  /** True if this drop put pieces into the frame. */
  locked: boolean;
}

export const FRAME_GROUP_ID = 0;

function countPairs(board: PuzlaBoard, a: PuzlaGroup, b: PuzlaGroup): number {
  let n = 0;
  for (const p of a.pieces) {
    for (const q of puzlaNeighbours(board.geo, p)) {
      if (board.pieceGroup[q] === b.id) n += 1;
    }
  }
  return n;
}

function hasBorder(board: PuzlaBoard, g: PuzlaGroup): boolean {
  return g.pieces.some((p) => puzlaIsBorderPiece(board.geo, p));
}

/** Move every piece of `from` into `into` (which keeps its origin) and delete `from`. */
function merge(board: PuzlaBoard, from: PuzlaGroup, into: PuzlaGroup): void {
  for (const p of from.pieces) {
    into.pieces.push(p);
    board.pieceGroup[p] = into.id;
  }
  into.z = Math.max(into.z, from.z);
  board.groups.delete(from.id);
}

/**
 * Resolve a drop of `groupId` where it currently lies.
 *
 * A candidate is any other group that is not held by someone else, has the
 * same rotation, and whose origin is within snap distance; it qualifies if the
 * two touch on the grid — or, for the frame, if the dropped group carries a
 * border piece (you can square an edge against the frame before anything is
 * in it; an interior piece has nothing to square against). The nearest
 * qualifying candidate wins, and the loop repeats with the merged group until
 * nothing else fits, so one drop can close several joins at once.
 */
export function resolveDrop(
  board: PuzlaBoard,
  groupId: number,
  isHeldByOther: (groupId: number) => boolean
): PuzlaDropResult {
  const result: PuzlaDropResult = { groupId, merges: 0, pairs: 0, locked: false };
  let cur = board.groups.get(groupId);
  if (!cur || cur.id === FRAME_GROUP_ID) return result;

  const snap = puzlaSnapDistance(board.geo);

  for (;;) {
    let best: { g: PuzlaGroup; d: number; pairs: number } | null = null;
    for (const g of board.groups.values()) {
      if (g.id === cur.id || g.rot !== cur.rot) continue;
      if (g.id !== FRAME_GROUP_ID && isHeldByOther(g.id)) continue;
      const d = Math.hypot(g.x - cur.x, g.y - cur.y);
      if (d >= snap) continue;
      const pairs = countPairs(board, cur, g);
      const qualifies =
        pairs > 0 ||
        (g.id === FRAME_GROUP_ID && hasBorder(board, cur)) ||
        (cur.id === FRAME_GROUP_ID && hasBorder(board, g));
      if (qualifies && (!best || d < best.d)) best = { g, d, pairs };
    }
    if (!best) break;

    if (cur.id === FRAME_GROUP_ID) {
      merge(board, best.g, cur);
      result.locked = true;
    } else {
      // The stationary group keeps its origin — the one you dropped onto is
      // the one that was already where it belongs.
      merge(board, cur, best.g);
      if (best.g.id === FRAME_GROUP_ID) result.locked = true;
      cur = best.g;
    }
    result.merges += 1;
    result.pairs += best.pairs;
  }

  result.groupId = cur.id;
  return result;
}
