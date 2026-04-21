import { useRef, useEffect, useCallback, useState } from 'react';
import { socket } from '../../../socket';
import { ColorPicker } from './ColorPicker';

const BRUSH_WIDTHS = [3, 6, 12];

interface DrawingPadProps {
  timeRemaining: number;
  strokeAction?: string;
  clearAction?: string;
}

export function DrawingPad({
  timeRemaining,
  strokeAction = 'draw:stroke',
  clearAction = 'draw:clear',
}: DrawingPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(6);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<{ x: number; y: number }[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasSizeRef = useRef({ w: 300, h: 300 });

  const getNormalizedPos = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };
    },
    []
  );

  const drawSegment = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { w, h } = canvasSizeRef.current;

      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x * w, from.y * h);
      ctx.lineTo(to.x * w, to.y * h);
      ctx.stroke();
    },
    [color, width]
  );

  const flushBatch = useCallback(() => {
    if (currentPointsRef.current.length < 2) return;
    socket.emit('game:player-action', {
      action: strokeAction,
      data: {
        points: [...currentPointsRef.current],
        color,
        width,
      },
    });
    // Keep last point for continuity
    currentPointsRef.current = [
      currentPointsRef.current[currentPointsRef.current.length - 1],
    ];
  }, [color, width, strokeAction]);

  const startDrawing = useCallback(
    (x: number, y: number) => {
      isDrawingRef.current = true;
      const pos = getNormalizedPos(x, y);
      currentPointsRef.current = [pos];

      batchTimerRef.current = setInterval(flushBatch, 50);
    },
    [getNormalizedPos, flushBatch]
  );

  const continueDrawing = useCallback(
    (x: number, y: number) => {
      if (!isDrawingRef.current) return;
      const pos = getNormalizedPos(x, y);
      const points = currentPointsRef.current;
      if (points.length > 0) {
        drawSegment(points[points.length - 1], pos);
      }
      points.push(pos);
    },
    [getNormalizedPos, drawSegment]
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (batchTimerRef.current) {
      clearInterval(batchTimerRef.current);
      batchTimerRef.current = null;
    }

    // Flush remaining points
    if (currentPointsRef.current.length >= 2) {
      socket.emit('game:player-action', {
        action: strokeAction,
        data: {
          points: [...currentPointsRef.current],
          color,
          width,
        },
      });
    }
    currentPointsRef.current = [];
  }, [color, width, strokeAction]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasSizeRef.current.w, canvasSizeRef.current.h);
    socket.emit('game:player-action', { action: clearAction, data: {} });
  }, [clearAction]);

  // Set up canvas size
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const w = container.clientWidth;
      const h = Math.min(container.clientHeight - 100, w * 0.75);
      canvas.width = w;
      canvas.height = h;
      canvasSizeRef.current = { w, h };
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Touch event handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      startDrawing(touch.clientX, touch.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      continueDrawing(touch.clientX, touch.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      stopDrawing();
    };
    const onMouseDown = (e: MouseEvent) => startDrawing(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => continueDrawing(e.clientX, e.clientY);
    const onMouseUp = () => stopDrawing();
    const onMouseLeave = () => stopDrawing();

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [startDrawing, continueDrawing, stopDrawing]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        gap: '0.5rem',
        padding: '0.5rem',
      }}
    >
      {/* Timer */}
      <div style={{ textAlign: 'center' }}>
        <span
          style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            color: timeRemaining <= 10 ? 'var(--danger)' : 'var(--text-primary)',
          }}
        >
          {timeRemaining}s
        </span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          background: '#fff',
          borderRadius: '8px',
          touchAction: 'none',
          flex: 1,
          width: '100%',
        }}
      />

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <ColorPicker selectedColor={color} onSelect={setColor} />
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          {BRUSH_WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setWidth(w)}
              style={{
                width: '36px',
                height: '36px',
                minHeight: '36px',
                minWidth: '36px',
                borderRadius: '8px',
                background: width === w ? 'var(--accent)' : 'var(--bg-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <div
                style={{
                  width: `${w + 2}px`,
                  height: `${w + 2}px`,
                  borderRadius: '50%',
                  background: width === w ? '#fff' : 'var(--text-primary)',
                }}
              />
            </button>
          ))}
        </div>
        <button
          onClick={handleClear}
          style={{
            padding: '0.4rem 0.8rem',
            background: 'var(--danger)',
            color: '#fff',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            minHeight: '36px',
          }}
        >
          Obriši
        </button>
      </div>
    </div>
  );
}
