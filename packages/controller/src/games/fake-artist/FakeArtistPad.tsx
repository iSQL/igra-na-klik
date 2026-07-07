import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawOp } from '@igra/shared';

interface FakeArtistPadProps {
  /** Existing shared drawing, rendered underneath as the drawer's canvas. */
  operations: DrawOp[];
  /** The drawer's avatar colour — every player draws in their own colour. */
  color: string;
  timeRemaining: number;
  onSubmit: (points: { x: number; y: number }[]) => void;
}

const STROKE_WIDTH = 6;

/**
 * Single-stroke drawing surface for Lažni umetnik. The player draws exactly
 * one continuous line on top of the shared drawing, then confirms it. Unlike
 * the free-draw pad there's no zoom/fill/undo — one line per turn is the
 * whole game.
 */
export function FakeArtistPad({
  operations,
  color,
  timeRemaining,
  onSubmit,
}: FakeArtistPadProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 300, h: 225 });
  const pointsRef = useRef<{ x: number; y: number }[]>([]);
  const drawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Existing shared strokes (fake-artist only ever produces strokes).
    for (const op of operations) {
      if (op.kind !== 'stroke' || op.points.length < 2) continue;
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(op.points[0].x * w, op.points[0].y * h);
      for (let i = 1; i < op.points.length; i++) {
        ctx.lineTo(op.points[i].x * w, op.points[i].y * h);
      }
      ctx.stroke();
    }

    // The line being drawn right now.
    const pts = pointsRef.current;
    if (pts.length >= 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = STROKE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x * w, pts[0].y * h);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * w, pts[i].y * h);
      }
      if (pts.length === 1) ctx.lineTo(pts[0].x * w, pts[0].y * h);
      ctx.stroke();
    }
  }, [operations, color]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const resize = () => {
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      if (w < 1 || h < 1) return;
      canvas.width = w;
      canvas.height = h;
      sizeRef.current = { w, h };
      render();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [render]);

  const toNorm = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (clientY - r.top) / r.height)),
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const down = (e: PointerEvent) => {
      // One line only: ignore new touches once a stroke exists or was sent.
      if (submitted || hasStroke) return;
      e.preventDefault();
      drawingRef.current = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Older browsers may reject capture — drawing still works.
      }
      pointsRef.current = [toNorm(e.clientX, e.clientY)];
      render();
    };
    const move = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      pointsRef.current.push(toNorm(e.clientX, e.clientY));
      render();
    };
    const up = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      drawingRef.current = false;
      if (pointsRef.current.length >= 1) setHasStroke(true);
      render();
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }, [render, submitted, hasStroke]);

  const clear = () => {
    pointsRef.current = [];
    setHasStroke(false);
    render();
  };

  const confirm = () => {
    if (pointsRef.current.length < 1 || submitted) return;
    setSubmitted(true);
    onSubmit([...pointsRef.current]);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        gap: '0.5rem',
        padding: '0.3rem',
      }}
    >
      <div
        ref={wrapperRef}
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          position: 'relative',
          background: '#fff',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            touchAction: 'none',
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: '6px',
            right: '10px',
            fontSize: '1.1rem',
            fontWeight: 700,
            color: timeRemaining <= 5 ? 'var(--danger)' : '#000',
            background: 'rgba(255,255,255,0.7)',
            borderRadius: '6px',
            padding: '0 0.4rem',
            pointerEvents: 'none',
          }}
        >
          {timeRemaining}s
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={clear}
          disabled={!hasStroke || submitted}
          style={{
            flex: 1,
            height: '48px',
            borderRadius: '10px',
            border: '2px solid var(--text-secondary)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontWeight: 700,
            opacity: !hasStroke || submitted ? 0.5 : 1,
          }}
        >
          Obriši
        </button>
        <button
          onClick={confirm}
          disabled={!hasStroke || submitted}
          style={{
            flex: 2,
            height: '48px',
            borderRadius: '10px',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontWeight: 800,
            opacity: !hasStroke || submitted ? 0.5 : 1,
          }}
        >
          {submitted ? 'Poslato ✓' : 'Potvrdi potez'}
        </button>
      </div>
    </div>
  );
}
