import { useMemo, useState } from 'react';
import type { GeoPin, GeoRevealPin } from '@igra/shared';
import serbiaMapUrl from '../assets/serbia-map.png';

const SVG_W = 1901;
const SVG_H = 2386;
const SVG_RATIO = SVG_W / SVG_H;

interface SerbiaMapProps {
  pins?: GeoRevealPin[];
  truePin?: GeoPin;
  /** Show connecting lines between every pin and the truth. */
  showLines?: boolean;
  /**
   * CSS height bound. The wrapper sizes itself so neither dimension exceeds
   * its constraint while preserving the SVG's aspect ratio (no letterboxing,
   * so pin overlays line up exactly).
   */
  maxHeightCss?: string;
  /** Optional CSS width bound. Defaults to 100% of parent. */
  maxWidthCss?: string;
  /**
   * Custom pack map image (host data `mapImageUrl`). When set, it replaces
   * the bundled Serbia map; the aspect ratio is measured from the loaded
   * image so pin percentages keep lining up.
   */
  mapImageUrl?: string;
}

/**
 * Map of Serbia (or a pack's custom map) with overlaid pins. Used by the
 * host on `reveal` (everyone's pin + the truth).
 */
export function SerbiaMap({
  pins,
  truePin,
  showLines,
  maxHeightCss = '70vh',
  maxWidthCss = '100%',
  mapImageUrl,
}: SerbiaMapProps) {
  // Custom maps arrive with unknown dimensions — measure on load. Until
  // then fall back to the Serbia ratio (brief reflow at most).
  const [customRatio, setCustomRatio] = useState<number | null>(null);
  const ratio = mapImageUrl ? (customRatio ?? SVG_RATIO) : SVG_RATIO;

  const wrapperStyle = useMemo<React.CSSProperties>(() => ({
    position: 'relative',
    // Pick the binding constraint between height-derived width and the
    // available width — whichever is smaller.
    width: `min(${maxWidthCss}, calc(${maxHeightCss} * ${ratio}))`,
    aspectRatio: `${ratio}`,
    margin: '0 auto',
    background: '#0B1728',
    borderRadius: '12px',
    overflow: 'hidden',
  }), [maxHeightCss, maxWidthCss, ratio]);

  return (
    <div style={wrapperStyle}>
      <img
        src={mapImageUrl ?? serbiaMapUrl}
        onLoad={(e) => {
          if (!mapImageUrl) return;
          const img = e.currentTarget;
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setCustomRatio(img.naturalWidth / img.naturalHeight);
          }
        }}
        alt="Mapa"
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      {/* Lines from each player pin to the truth. Normalized [0,1] viewBox
          plus non-scaling stroke so dashes look identical regardless of the
          wrapper's aspect ratio. */}
      {showLines && truePin && pins && (
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {pins.map((p) => (
            <line
              key={p.playerId}
              x1={p.pin.x}
              y1={p.pin.y}
              x2={truePin.x}
              y2={truePin.y}
              stroke={p.color}
              strokeWidth={2}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
              opacity={0.85}
            />
          ))}
        </svg>
      )}

      {/* Player pins. */}
      {pins?.map((p) => (
        <div
          key={p.playerId}
          style={{
            position: 'absolute',
            left: `${p.pin.x * 100}%`,
            top: `${p.pin.y * 100}%`,
            transform: 'translate(-50%, -100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              color: '#fff',
              background: p.color,
              padding: '2px 6px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
            }}
          >
            {p.name}
          </div>
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: `8px solid ${p.color}`,
              marginTop: '-1px',
            }}
          />
        </div>
      ))}

      {/* Truth pin (gold star). */}
      {truePin && (
        <div
          style={{
            position: 'absolute',
            left: `${truePin.x * 100}%`,
            top: `${truePin.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, #F2CE74 0%, #C29B47 100%)',
              border: '3px solid #fff',
              boxShadow: '0 0 12px rgba(255, 200, 0, 0.85)',
            }}
          />
        </div>
      )}
    </div>
  );
}
