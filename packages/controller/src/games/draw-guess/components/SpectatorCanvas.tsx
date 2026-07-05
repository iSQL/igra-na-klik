import { useEffect, useState } from 'react';
import type { DrawOp, FillOp } from '@igra/shared';
import { visibleOps, scanlineFloodFill, parseHexColor } from '@igra/shared';

// Read-only view of the drawer's canvas for hostless rooms, where there is
// no TV to look at. Same 4:3 ratio as the host canvas; ops are normalized
// 0–1 so any pixel size renders proportionally.
const CANVAS_W = 480;
const CANVAS_H = 360;

export function SpectatorCanvas({ operations }: { operations: DrawOp[] }) {
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const visible = visibleOps(operations);
    let i = 0;
    while (i < visible.length) {
      const op = visible[i];
      if (op.kind === 'stroke') {
        if (op.points.length >= 2) {
          ctx.strokeStyle = op.color;
          ctx.lineWidth = op.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(op.points[0].x * CANVAS_W, op.points[0].y * CANVAS_H);
          for (let j = 1; j < op.points.length; j++) {
            ctx.lineTo(op.points[j].x * CANVAS_W, op.points[j].y * CANVAS_H);
          }
          ctx.stroke();
        }
        i++;
      } else if (op.kind === 'fill') {
        // Batch consecutive fills into one getImageData/putImageData trip.
        let img: ImageData | null = null;
        try {
          img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
        } catch {
          i++;
          continue;
        }
        while (i < visible.length && visible[i].kind === 'fill') {
          const f = visible[i] as FillOp;
          scanlineFloodFill(
            img.data,
            CANVAS_W,
            CANVAS_H,
            Math.floor(f.x * CANVAS_W),
            Math.floor(f.y * CANVAS_H),
            parseHexColor(f.color),
            f.tolerance ?? 0
          );
          i++;
        }
        ctx.putImageData(img, 0, 0);
      } else {
        i++;
      }
    }
  }, [canvasEl, operations]);

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '0.6rem',
        width: '100%',
        aspectRatio: '4 / 3',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <canvas
        ref={setCanvasEl}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
