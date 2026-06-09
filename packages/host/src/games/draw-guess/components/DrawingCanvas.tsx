import { useRef, useEffect } from 'react';
import type { DrawOp } from '@igra/shared';
import { renderOps, paintStroke } from './renderOps';

interface DrawingCanvasProps {
  operations: DrawOp[];
  width?: number;
  height?: number;
}

export function DrawingCanvas({ operations, width = 600, height = 450 }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastOpsRef = useRef<DrawOp[] | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Server re-serializes ops every state-update, so reference equality is
    // useless across socket echoes. Detect append-only growth by checking
    // that the previous tail id is still the same op at that index in the
    // new array — much cheaper than a full id walk.
    const prev = lastOpsRef.current;
    const prevLen = prev?.length ?? 0;
    const grew =
      !!prev &&
      operations.length > prevLen &&
      (prevLen === 0 || operations[prevLen - 1]?.id === prev[prevLen - 1].id);

    const newOps = grew ? operations.slice(prevLen) : operations;
    const needsFullRedraw =
      !grew || newOps.some((o) => o.kind === 'fill' || o.kind === 'erase');

    if (needsFullRedraw) {
      ctx.clearRect(0, 0, width, height);
      renderOps(ctx, operations, width, height);
    } else {
      for (const op of newOps) {
        if (op.kind === 'stroke') paintStroke(ctx, op, width, height);
      }
    }

    lastOpsRef.current = operations;
  }, [operations, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        background: '#fff',
        borderRadius: '12px',
        width: `${width}px`,
        height: `${height}px`,
        maxWidth: '100%',
      }}
    />
  );
}
