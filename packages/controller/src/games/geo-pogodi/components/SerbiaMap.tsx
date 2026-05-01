import { useCallback, useRef, useState } from 'react';
import type { GeoPin } from '@igra/shared';
import serbiaSvgUrl from '../assets/serbia.svg';

interface SerbiaMapProps {
  pin?: GeoPin;
  onPinChange?: (pin: GeoPin) => void;
  /** Disable taps (used after the player has locked their pin). */
  disabled?: boolean;
  /**
   * Maximum CSS height as a CSS string (e.g. '60dvh', '500px'). The wrapper
   * sizes itself to fit both horizontally AND vertically while preserving
   * the SVG's aspect ratio — so pins overlay the rendered image exactly.
   */
  maxHeightCss?: string;
  pinColor?: string;
}

const SVG_W = 724.531;
const SVG_H = 1036.962;
const SVG_RATIO = SVG_W / SVG_H; // ≈ 0.699 (taller than wide)

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
// Movement (in CSS px) above which a pointerdown→up sequence is treated as
// a drag/pan rather than a tap.
const TAP_THRESHOLD = 8;

interface SinglePointerStart {
  x: number;
  y: number;
  panAtStart: { x: number; y: number };
  moved: boolean;
}

interface PinchStart {
  midpoint: { x: number; y: number };
  distance: number;
  zoomAtStart: number;
  panAtStart: { x: number; y: number };
}

/**
 * Touch-tuned map of Serbia.
 *  - Tap to drop a pin.
 *  - Pinch (two fingers) to zoom.
 *  - When zoomed, drag with one finger to pan.
 *  - Double-tap or the ↻ button resets the view.
 *
 * Pin coordinates are stored as normalized [0, 1] in the underlying map
 * space — zoom/pan only change the rendered visual, never the recorded pin.
 */
export function SerbiaMap({
  pin,
  onPinChange,
  disabled,
  maxHeightCss = '60dvh',
  pinColor = '#ff3b3b',
}: SerbiaMapProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Track active pointers so we can distinguish single-finger drag from
  // two-finger pinch.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const singleStartRef = useRef<SinglePointerStart | null>(null);
  const pinchStartRef = useRef<PinchStart | null>(null);

  const clampPan = useCallback(
    (next: { x: number; y: number }, currentZoom: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return next;
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      // With transform-origin: 0 0 and scale(z), content occupies
      //   [pan.x, pan.x + w * z] × [pan.y, pan.y + h * z]
      // Keep content fully covering the wrapper.
      const minX = w * (1 - currentZoom);
      const minY = h * (1 - currentZoom);
      return {
        x: Math.min(0, Math.max(minX, next.x)),
        y: Math.min(0, Math.max(minY, next.y)),
      };
    },
    []
  );

  const placePinAtClient = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled || !onPinChange) return;
      // Inner content's bounding rect already reflects the transform, so
      // (client - rect) / rect is the correct normalized pin coord.
      const inner = contentRef.current;
      if (!inner) return;
      const rect = inner.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      onPinChange({ x, y });
    },
    [disabled, onPinChange]
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Note: zoom/pan are allowed even when `disabled` so a player who has
    // already locked their pin can still inspect the map while waiting.
    // Pin placement is the only thing gated by `disabled` (in placePinAtClient).
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      singleStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panAtStart: { ...pan },
        moved: false,
      };
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 2) {
      // Two fingers down: start a pinch gesture.
      const pts = Array.from(pointersRef.current.values());
      const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midpoint = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      pinchStartRef.current = {
        midpoint,
        distance: distance || 1,
        zoomAtStart: zoom,
        panAtStart: { ...pan },
      };
      // Single-finger gesture is no longer a tap.
      if (singleStartRef.current) singleStartRef.current.moved = true;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // PINCH (two pointers down)
    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const newDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const newMid = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
      const start = pinchStartRef.current;
      const rawZoom = start.zoomAtStart * (newDist / start.distance);
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawZoom));

      // Keep the content point under the gesture's start midpoint anchored
      // as zoom changes, then add the midpoint translation.
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const wrapperRect = wrapper.getBoundingClientRect();
      // Pre-zoom content coord under start midpoint:
      //   contentX = (start.midpoint.x - wrapperRect.left - start.panAtStart.x) / start.zoomAtStart
      const localStartX = start.midpoint.x - wrapperRect.left;
      const localStartY = start.midpoint.y - wrapperRect.top;
      const contentX = (localStartX - start.panAtStart.x) / start.zoomAtStart;
      const contentY = (localStartY - start.panAtStart.y) / start.zoomAtStart;
      // After zoom change, keep that same content point under the CURRENT
      // midpoint:
      //   newPan = newMidLocal - contentXY * newZoom
      const localNewX = newMid.x - wrapperRect.left;
      const localNewY = newMid.y - wrapperRect.top;
      const nextPan = {
        x: localNewX - contentX * clampedZoom,
        y: localNewY - contentY * clampedZoom,
      };
      setZoom(clampedZoom);
      setPan(clampPan(nextPan, clampedZoom));
      return;
    }

    // SINGLE-POINTER drag (potential pan when zoomed, or tap-shake)
    if (pointersRef.current.size === 1 && singleStartRef.current) {
      const dx = e.clientX - singleStartRef.current.x;
      const dy = e.clientY - singleStartRef.current.y;
      if (Math.hypot(dx, dy) > TAP_THRESHOLD) {
        singleStartRef.current.moved = true;
      }
      if (zoom > 1 && singleStartRef.current.moved) {
        const next = {
          x: singleStartRef.current.panAtStart.x + dx,
          y: singleStartRef.current.panAtStart.y + dy,
        };
        setPan(clampPan(next, zoom));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);

    // If this was a single-pointer interaction and the finger barely moved,
    // treat it as a tap and place the pin.
    if (
      pointersRef.current.size === 0 &&
      singleStartRef.current &&
      !singleStartRef.current.moved &&
      !pinchStartRef.current
    ) {
      placePinAtClient(e.clientX, e.clientY);
    }

    if (pointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      singleStartRef.current = null;
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 0) singleStartRef.current = null;
  };

  return (
    <div
      ref={wrapperRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{
        position: 'relative',
        // Fit-to-screen sizing: stay as wide as possible while keeping the
        // map's height ≤ maxHeightCss. The min() picks whichever dimension
        // is the binding constraint on the current device.
        width: `min(100%, calc(${maxHeightCss} * ${SVG_RATIO}))`,
        aspectRatio: `${SVG_W} / ${SVG_H}`,
        margin: '0 auto',
        background: '#0e1424',
        borderRadius: '12px',
        overflow: 'hidden',
        touchAction: 'none',
        cursor: disabled ? 'default' : 'crosshair',
        userSelect: 'none',
      }}
    >
      {/* Inner content layer — gets transformed for zoom/pan. */}
      <div
        ref={contentRef}
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          willChange: 'transform',
        }}
      >
        <img
          src={serbiaSvgUrl}
          alt="Mapa Srbije"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            pointerEvents: 'none',
            opacity: disabled ? 0.6 : 1,
          }}
        />
        {pin && (
          <div
            style={{
              position: 'absolute',
              left: `${pin.x * 100}%`,
              top: `${pin.y * 100}%`,
              transform: 'translate(-50%, -100%)',
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderTop: `12px solid ${pinColor}`,
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
              }}
            />
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: pinColor,
                marginTop: '-3px',
                boxShadow: '0 0 0 2px rgba(255,255,255,0.85)',
              }}
            />
          </div>
        )}
      </div>

      {/* Reset-view button (shown only while zoomed). */}
      {zoom > 1.01 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            resetView();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            right: 8,
            top: 8,
            padding: '6px 10px',
            fontSize: '0.85rem',
            fontWeight: 700,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
          aria-label="Resetuj prikaz"
        >
          ↻
        </button>
      )}

      {/* Zoom level indicator */}
      {zoom > 1.01 && (
        <div
          style={{
            position: 'absolute',
            left: 8,
            top: 8,
            padding: '4px 8px',
            fontSize: '0.75rem',
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            borderRadius: '6px',
            pointerEvents: 'none',
          }}
        >
          {zoom.toFixed(1)}×
        </div>
      )}
    </div>
  );
}
