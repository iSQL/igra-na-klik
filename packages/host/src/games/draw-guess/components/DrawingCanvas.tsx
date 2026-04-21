import { useRef, useEffect } from 'react';
import type { Stroke } from '@igra/shared';

interface DrawingCanvasProps {
  strokes: Stroke[];
  width?: number;
  height?: number;
}

export function DrawingCanvas({ strokes, width = 600, height = 450 }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastStrokesRef = useRef<Stroke[] | null>(null);
  const lastStrokeCountRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sameArray = lastStrokesRef.current === strokes;
    const grewInPlace =
      sameArray && strokes.length > lastStrokeCountRef.current;

    if (!grewInPlace) {
      ctx.clearRect(0, 0, width, height);
      lastStrokeCountRef.current = 0;
    }

    for (let i = lastStrokeCountRef.current; i < strokes.length; i++) {
      const stroke = strokes[i];
      if (stroke.points.length < 2) continue;

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height);
      for (let j = 1; j < stroke.points.length; j++) {
        ctx.lineTo(stroke.points[j].x * width, stroke.points[j].y * height);
      }
      ctx.stroke();
    }

    lastStrokesRef.current = strokes;
    lastStrokeCountRef.current = strokes.length;
  }, [strokes, width, height]);

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
