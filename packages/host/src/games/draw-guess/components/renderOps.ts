import type { DrawOp, StrokeOp, FillOp } from '@igra/shared';
import { visibleOps, scanlineFloodFill, parseHexColor } from '@igra/shared';

export function renderOps(
  ctx: CanvasRenderingContext2D,
  ops: DrawOp[],
  width: number,
  height: number
): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const visible = visibleOps(ops);

  // Coalesce: do strokes then fills then strokes... but actually we need to
  // preserve op order, so we walk ops in order. Fills require getImageData+
  // putImageData which is expensive (~5ms round trip for 600x450). If multiple
  // fills appear back-to-back, batch them into one round trip.
  let i = 0;
  while (i < visible.length) {
    const op = visible[i];
    if (op.kind === 'stroke') {
      paintStroke(ctx, op, width, height);
      i++;
    } else if (op.kind === 'fill') {
      // Batch consecutive fills.
      let img: ImageData | null = null;
      try {
        img = ctx.getImageData(0, 0, width, height);
      } catch {
        i++;
        continue;
      }
      while (i < visible.length && visible[i].kind === 'fill') {
        const f = visible[i] as FillOp;
        const sx = Math.floor(f.x * width);
        const sy = Math.floor(f.y * height);
        scanlineFloodFill(
          img.data,
          width,
          height,
          sx,
          sy,
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
}

export function paintStroke(
  ctx: CanvasRenderingContext2D,
  op: StrokeOp,
  width: number,
  height: number
): void {
  if (op.points.length < 2) return;
  ctx.strokeStyle = op.color;
  ctx.lineWidth = op.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(op.points[0].x * width, op.points[0].y * height);
  for (let j = 1; j < op.points.length; j++) {
    ctx.lineTo(op.points[j].x * width, op.points[j].y * height);
  }
  ctx.stroke();
}

export function paintFill(
  ctx: CanvasRenderingContext2D,
  op: FillOp,
  width: number,
  height: number
): void {
  const sx = Math.floor(op.x * width);
  const sy = Math.floor(op.y * height);
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return;

  let img: ImageData;
  try {
    img = ctx.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const touched = scanlineFloodFill(
    img.data,
    width,
    height,
    sx,
    sy,
    parseHexColor(op.color),
    op.tolerance ?? 0
  );
  if (touched) ctx.putImageData(img, 0, 0);
}
