import type { DrawOp, EraseOp, FillOp, Stroke, StrokeOp } from './draw-guess.js';

let opCounter = 0;

export function newOpId(): string {
  return `o${Date.now().toString(36)}${(++opCounter).toString(36)}`;
}

export function appendStrokeOp(
  ops: DrawOp[],
  data: {
    points: { x: number; y: number }[];
    color: string;
    width: number;
    sessionId?: string;
  }
): StrokeOp {
  const op: StrokeOp = { id: newOpId(), kind: 'stroke', ...data };
  ops.push(op);
  return op;
}

export function appendFillOp(
  ops: DrawOp[],
  data: { x: number; y: number; color: string; tolerance?: number }
): FillOp {
  const op: FillOp = { id: newOpId(), kind: 'fill', ...data };
  ops.push(op);
  return op;
}

export function appendEraseOp(ops: DrawOp[], targetId: string): EraseOp | null {
  const target = ops.find((o) => o.id === targetId && o.kind !== 'erase');
  if (!target) return null;
  const alreadyErased = ops.some(
    (o) => o.kind === 'erase' && o.targetId === targetId
  );
  if (alreadyErased) return null;
  const op: EraseOp = { id: newOpId(), kind: 'erase', targetId };
  ops.push(op);
  return op;
}

/**
 * Pops the trailing op. If it's a stroke op with a sessionId, pops all
 * preceding ops sharing the same sessionId (so one undo erases the full
 * pen stroke instead of a single 50ms batch). Returns the number of ops
 * removed.
 */
export function undoLast(ops: DrawOp[]): number {
  if (ops.length === 0) return 0;
  const last = ops[ops.length - 1];
  if (last.kind === 'stroke' && last.sessionId) {
    const sid = last.sessionId;
    let removed = 0;
    while (ops.length > 0) {
      const top = ops[ops.length - 1];
      if (top.kind === 'stroke' && top.sessionId === sid) {
        ops.pop();
        removed++;
      } else {
        break;
      }
    }
    return removed;
  }
  ops.pop();
  return 1;
}

export function clearOps(ops: DrawOp[]): void {
  ops.length = 0;
}

export function visibleOps(ops: DrawOp[]): DrawOp[] {
  const erased = new Set<string>();
  for (const op of ops) {
    if (op.kind === 'erase') erased.add(op.targetId);
  }
  return ops.filter((o) => o.kind !== 'erase' && !erased.has(o.id));
}

export function legacyStrokesToOps(strokes: Stroke[] | undefined): DrawOp[] {
  if (!strokes) return [];
  return strokes.map(
    (s): StrokeOp => ({
      id: newOpId(),
      kind: 'stroke',
      points: s.points,
      color: s.color,
      width: s.width,
    })
  );
}
