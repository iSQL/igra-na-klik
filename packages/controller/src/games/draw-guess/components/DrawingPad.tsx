import { useRef, useEffect, useCallback, useState } from 'react';
import { socket } from '../../../socket';
import type { DrawOp, StrokeOp, FillOp } from '@igra/shared';
import { visibleOps, scanlineFloodFill, parseHexColor } from '@igra/shared';
import { ColorPicker } from './ColorPicker';
import { BrushSizePicker } from './BrushSizePicker';
import { ToolButton, type DrawTool } from './ToolButton';
import { useT } from '../../../i18n/useT';

interface DrawingPadProps {
  timeRemaining: number;
  operations: DrawOp[];
  actionPrefix?: 'draw' | 'slepi';
}

interface View {
  scale: number;
  tx: number;
  ty: number;
}

interface Pt {
  x: number;
  y: number;
}

export function DrawingPad({
  timeRemaining,
  operations,
  actionPrefix = 'draw',
}: DrawingPadProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(5);
  const [tool, setTool] = useState<DrawTool>('pencil');

  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const viewVersionRef = useRef(0);
  const [, forceRender] = useState(0);
  const invalidateView = useCallback(() => {
    viewVersionRef.current++;
    forceRender((n) => n + 1);
  }, []);

  const isPencilActiveRef = useRef(false);
  const currentPointsRef = useRef<Pt[]>([]);
  const pencilSessionIdRef = useRef<string | null>(null);
  const batchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasSizeRef = useRef({ w: 300, h: 300 });

  // Hybrid render tracking: detect append-only growth by op id.
  const lastOpsRef = useRef<DrawOp[] | null>(null);
  const lastViewVersionRef = useRef(-1);

  // Strokes flushed to the server but not yet present in an `operations`
  // snapshot. The server doesn't echo stroke batches back (slepi), so a
  // full repaint before the next snapshot (pinch-zoom, resize) would
  // otherwise briefly drop just-drawn strokes. `seq` is the batch index
  // within its pencil session — snapshots may contain only a prefix of a
  // session's batches, so pruning must be per-batch, not per-session.
  const pendingLocalOpsRef = useRef<{ seq: number; op: StrokeOp }[]>([]);
  const batchSeqRef = useRef(0);

  const activeTouchesRef = useRef<Map<number, Pt>>(new Map());
  const gestureModeRef = useRef<'idle' | 'draw' | 'pan-zoom'>('idle');
  const pinchStartRef = useRef<{
    startDist: number;
    startScale: number;
    centerLogical: Pt;
  } | null>(null);

  // Slepi telefoni has no live spectators of the drawing, so batches can
  // flush half as often; draw-guess keeps 50ms so the host canvas stays live.
  const flushIntervalMs = actionPrefix === 'slepi' ? 100 : 50;

  const emit = useCallback(
    (action: string, data: Record<string, unknown>) => {
      socket.emit('game:player-action', { action, data });
    },
    []
  );

  const screenToLogical = useCallback((clientX: number, clientY: number): Pt => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;
    const { scale, tx, ty } = viewRef.current;
    return {
      x: Math.max(0, Math.min(1, u / scale + tx)),
      y: Math.max(0, Math.min(1, v / scale + ty)),
    };
  }, []);

  const paintInProgress = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!isPencilActiveRef.current || currentPointsRef.current.length < 2) return;
      const { w, h } = canvasSizeRef.current;
      const { scale, tx, ty } = viewRef.current;
      const pts = currentPointsRef.current;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo((pts[0].x - tx) * w * scale, (pts[0].y - ty) * h * scale);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo((pts[i].x - tx) * w * scale, (pts[i].y - ty) * h * scale);
      }
      ctx.stroke();
    },
    [color, width]
  );

  const fullRepaint = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const { w, h } = canvasSizeRef.current;
      const { scale, tx, ty } = viewRef.current;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      const visible = visibleOps(operations);

      // Batch consecutive fills into one getImageData/putImageData round trip.
      let i = 0;
      while (i < visible.length) {
        const op = visible[i];
        if (op.kind === 'stroke') {
          paintStrokeView(ctx, op, w, h, scale, tx, ty);
          i++;
        } else if (op.kind === 'fill') {
          let img: ImageData | null = null;
          try {
            img = ctx.getImageData(0, 0, w, h);
          } catch {
            i++;
            continue;
          }
          while (i < visible.length && visible[i].kind === 'fill') {
            const f = visible[i] as FillOp;
            const sx = Math.floor((f.x - tx) * w * scale);
            const sy = Math.floor((f.y - ty) * h * scale);
            scanlineFloodFill(
              img.data,
              w,
              h,
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

      // Flushed-but-unacked strokes are always newer than every server op,
      // so painting them last keeps chronological order.
      for (const { op } of pendingLocalOpsRef.current) {
        paintStrokeView(ctx, op, w, h, scale, tx, ty);
      }
    },
    [operations]
  );

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h } = canvasSizeRef.current;
    const { scale, tx, ty } = viewRef.current;

    const prev = lastOpsRef.current;
    const prevLen = prev?.length ?? 0;
    const viewChanged = lastViewVersionRef.current !== viewVersionRef.current;

    // Socket delivery is ordered, so the number of a session's ops in the
    // snapshot equals the number of its batches the server has seen —
    // drop exactly those from pending and keep the still-in-flight rest.
    if (prev !== operations && pendingLocalOpsRef.current.length > 0) {
      const ackedPerSession = new Map<string, number>();
      for (const op of operations) {
        if (op.kind === 'stroke' && op.sessionId) {
          ackedPerSession.set(
            op.sessionId,
            (ackedPerSession.get(op.sessionId) ?? 0) + 1
          );
        }
      }
      pendingLocalOpsRef.current = pendingLocalOpsRef.current.filter(
        ({ seq, op }) =>
          !!op.sessionId && seq >= (ackedPerSession.get(op.sessionId) ?? 0)
      );
    }

    // Same ops and same view (e.g. a timer-tick re-render): skip repainting.
    // In-progress segments are already on the canvas via drawSegmentImmediate.
    if (
      prev &&
      !viewChanged &&
      operations.length === prevLen &&
      (prevLen === 0 || operations[prevLen - 1]?.id === prev[prevLen - 1].id)
    ) {
      lastOpsRef.current = operations;
      return;
    }

    const grew =
      !!prev &&
      !viewChanged &&
      operations.length > prevLen &&
      (prevLen === 0 || operations[prevLen - 1]?.id === prev[prevLen - 1].id);

    const newOps = grew ? operations.slice(prevLen) : operations;
    const needsFullRedraw =
      viewChanged || !grew || newOps.some((o) => o.kind === 'fill' || o.kind === 'erase');

    if (needsFullRedraw) {
      fullRepaint(ctx);
    } else {
      for (const op of newOps) {
        if (op.kind === 'stroke') paintStrokeView(ctx, op, w, h, scale, tx, ty);
      }
    }

    paintInProgress(ctx);

    lastOpsRef.current = operations;
    lastViewVersionRef.current = viewVersionRef.current;
  }, [operations, fullRepaint, paintInProgress]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

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
      canvasSizeRef.current = { w, h };
      // Canvas was wiped by the width/height assignment; force full repaint
      // on the next renderCanvas call.
      viewVersionRef.current++;
      renderCanvas();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [renderCanvas]);

  const drawSegmentImmediate = useCallback(
    (from: Pt, to: Pt) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { w, h } = canvasSizeRef.current;
      const { scale, tx, ty } = viewRef.current;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo((from.x - tx) * w * scale, (from.y - ty) * h * scale);
      ctx.lineTo((to.x - tx) * w * scale, (to.y - ty) * h * scale);
      ctx.stroke();
    },
    [color, width]
  );

  const flushBatch = useCallback(() => {
    if (currentPointsRef.current.length < 2) return;
    const points = [...currentPointsRef.current];
    emit(`${actionPrefix}:stroke`, {
      points,
      color,
      width,
      sessionId: pencilSessionIdRef.current,
    });
    pendingLocalOpsRef.current.push({
      seq: batchSeqRef.current++,
      op: {
        id: newSessionId(),
        kind: 'stroke',
        points,
        color,
        width,
        sessionId: pencilSessionIdRef.current ?? undefined,
      },
    });
    currentPointsRef.current = [points[points.length - 1]];
  }, [color, width, emit, actionPrefix]);

  const startPencil = useCallback(
    (clientX: number, clientY: number) => {
      isPencilActiveRef.current = true;
      pencilSessionIdRef.current = newSessionId();
      batchSeqRef.current = 0;
      const pos = screenToLogical(clientX, clientY);
      currentPointsRef.current = [pos];
      batchTimerRef.current = setInterval(flushBatch, flushIntervalMs);
    },
    [screenToLogical, flushBatch, flushIntervalMs]
  );

  const continuePencil = useCallback(
    (clientX: number, clientY: number) => {
      if (!isPencilActiveRef.current) return;
      const pos = screenToLogical(clientX, clientY);
      const points = currentPointsRef.current;
      if (points.length > 0) drawSegmentImmediate(points[points.length - 1], pos);
      points.push(pos);
    },
    [screenToLogical, drawSegmentImmediate]
  );

  const stopPencil = useCallback(() => {
    if (!isPencilActiveRef.current) return;
    isPencilActiveRef.current = false;
    if (batchTimerRef.current) {
      clearInterval(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    // A tap that never moved leaves a single point. Duplicate it so the
    // stroke has two identical points — with lineCap 'round' that renders
    // as a filled dot everywhere (local, host, previews all guard on
    // points.length < 2, which two points clear).
    if (currentPointsRef.current.length === 1) {
      const p = currentPointsRef.current[0];
      currentPointsRef.current = [p, p];
      drawSegmentImmediate(p, p);
    }
    if (currentPointsRef.current.length >= 2) {
      const points = [...currentPointsRef.current];
      emit(`${actionPrefix}:stroke`, {
        points,
        color,
        width,
        sessionId: pencilSessionIdRef.current,
      });
      pendingLocalOpsRef.current.push({
        seq: batchSeqRef.current++,
        op: {
          id: newSessionId(),
          kind: 'stroke',
          points,
          color,
          width,
          sessionId: pencilSessionIdRef.current ?? undefined,
        },
      });
    }
    currentPointsRef.current = [];
    pencilSessionIdRef.current = null;
  }, [color, width, emit, actionPrefix, drawSegmentImmediate]);

  const cancelPencil = useCallback(() => {
    isPencilActiveRef.current = false;
    if (batchTimerRef.current) {
      clearInterval(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    currentPointsRef.current = [];
    pencilSessionIdRef.current = null;
  }, []);

  const triggerFill = useCallback(
    (lx: number, ly: number) => {
      emit(`${actionPrefix}:fill`, { x: lx, y: ly, color });
    },
    [color, emit, actionPrefix]
  );

  const handleClear = useCallback(() => {
    // Undo/clear invalidate pending strokes — the echoed snapshot is the
    // authority on what survived, so don't repaint them over it.
    pendingLocalOpsRef.current = [];
    emit(`${actionPrefix}:clear`, {});
  }, [emit, actionPrefix]);

  const handleUndo = useCallback(() => {
    pendingLocalOpsRef.current = [];
    emit(`${actionPrefix}:undo`, {});
  }, [emit, actionPrefix]);

  const startPinch = useCallback(() => {
    const touches = Array.from(activeTouchesRef.current.values());
    if (touches.length < 2) return;
    const [a, b] = touches;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    pinchStartRef.current = {
      startDist: dist,
      startScale: viewRef.current.scale,
      centerLogical: screenToLogical(cx, cy),
    };
  }, [screenToLogical]);

  const updatePinch = useCallback(() => {
    const touches = Array.from(activeTouchesRef.current.values());
    const ps = pinchStartRef.current;
    if (touches.length < 2 || !ps) return;
    const [a, b] = touches;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;

    const ratio = dist / ps.startDist;
    const newScale = Math.max(1, Math.min(6, ps.startScale * ratio));

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const u = (cx - rect.left) / rect.width;
    const v = (cy - rect.top) / rect.height;

    const rawTx = ps.centerLogical.x - u / newScale;
    const rawTy = ps.centerLogical.y - v / newScale;
    const maxOffset = 1 - 1 / newScale;

    viewRef.current = {
      scale: newScale,
      tx: Math.max(0, Math.min(maxOffset, rawTx)),
      ty: Math.max(0, Math.min(maxOffset, rawTy)),
    };
    invalidateView();
  }, [invalidateView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleSingleStart = (clientX: number, clientY: number) => {
      if (tool === 'pencil') {
        gestureModeRef.current = 'draw';
        startPencil(clientX, clientY);
      } else if (tool === 'fill') {
        gestureModeRef.current = 'idle';
        const pos = screenToLogical(clientX, clientY);
        triggerFill(pos.x, pos.y);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        activeTouchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      const count = activeTouchesRef.current.size;
      if (count === 1 && gestureModeRef.current === 'idle') {
        const [touch] = activeTouchesRef.current.values();
        handleSingleStart(touch.x, touch.y);
      } else if (count >= 2) {
        if (gestureModeRef.current === 'draw') cancelPencil();
        gestureModeRef.current = 'pan-zoom';
        startPinch();
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (activeTouchesRef.current.has(t.identifier)) {
          activeTouchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
      }
      if (gestureModeRef.current === 'draw') {
        const [touch] = activeTouchesRef.current.values();
        if (touch) continuePencil(touch.x, touch.y);
      } else if (gestureModeRef.current === 'pan-zoom') {
        updatePinch();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        activeTouchesRef.current.delete(t.identifier);
      }
      const count = activeTouchesRef.current.size;
      if (gestureModeRef.current === 'draw' && count === 0) {
        stopPencil();
        gestureModeRef.current = 'idle';
      } else if (gestureModeRef.current === 'pan-zoom') {
        if (count <= 1) {
          gestureModeRef.current = 'idle';
          pinchStartRef.current = null;
        }
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (gestureModeRef.current !== 'idle') return;
      handleSingleStart(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (gestureModeRef.current === 'draw') continuePencil(e.clientX, e.clientY);
    };
    const onMouseUp = () => {
      if (gestureModeRef.current === 'draw') {
        stopPencil();
        gestureModeRef.current = 'idle';
      }
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
    };
  }, [
    tool,
    screenToLogical,
    startPencil,
    continuePencil,
    stopPencil,
    cancelPencil,
    triggerFill,
    startPinch,
    updatePinch,
  ]);

  const zoomed = viewRef.current.scale > 1.01;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        gap: '0.3rem',
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
          borderRadius: '8px',
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
            color: timeRemaining <= 10 ? 'var(--danger)' : '#000',
            background: 'rgba(255,255,255,0.7)',
            borderRadius: '6px',
            padding: '0 0.4rem',
            pointerEvents: 'none',
          }}
        >
          {timeRemaining}s
        </span>
        {zoomed && (
          <button
            onClick={() => {
              viewRef.current = { scale: 1, tx: 0, ty: 0 };
              invalidateView();
            }}
            style={{
              position: 'absolute',
              top: '6px',
              left: '6px',
              padding: '0.2rem 0.5rem',
              fontSize: '0.75rem',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid var(--text-secondary)',
              borderRadius: '6px',
            }}
          >
            {t('drawGuess.resetZoom')}
          </button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.3rem',
          flexWrap: 'wrap',
        }}
      >
        <ToolButton tool="pencil" active={tool === 'pencil'} onSelect={setTool} />
        <ToolButton tool="fill" active={tool === 'fill'} onSelect={setTool} />
        <BrushSizePicker width={width} onChange={setWidth} />
        <button
          onClick={handleUndo}
          style={{
            minWidth: '56px',
            height: '36px',
            padding: '0 0.5rem',
            borderRadius: '8px',
            border: '2px solid var(--text-secondary)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: '0.8rem',
          }}
        >
          {t('drawGuess.undo')}
        </button>
        <button
          onClick={handleClear}
          style={{
            minWidth: '56px',
            height: '36px',
            padding: '0 0.5rem',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--danger)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.8rem',
          }}
        >
          {t('drawGuess.clearAll')}
        </button>
      </div>

      <ColorPicker selectedColor={color} onSelect={setColor} />
    </div>
  );
}

function newSessionId(): string {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

function paintStrokeView(
  ctx: CanvasRenderingContext2D,
  op: StrokeOp,
  w: number,
  h: number,
  scale: number,
  tx: number,
  ty: number
): void {
  if (op.points.length < 2) return;
  ctx.strokeStyle = op.color;
  ctx.lineWidth = op.width * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo((op.points[0].x - tx) * w * scale, (op.points[0].y - ty) * h * scale);
  for (let i = 1; i < op.points.length; i++) {
    ctx.lineTo((op.points[i].x - tx) * w * scale, (op.points[i].y - ty) * h * scale);
  }
  ctx.stroke();
}
