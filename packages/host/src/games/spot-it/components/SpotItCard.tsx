import { motion } from 'framer-motion';
import { SPOT_IT_SYMBOLS } from '@igra/shared';

/**
 * 8 fixed slot positions inside the unit-square card (x,y ∈ [0,1]),
 * with scale baked in. Two visual rings + an offset inner cluster
 * so the layout reads as "Dobble-like" rather than a tidy ring.
 */
// 8 slots evenly distributed on a single ring at radius 0.35 (every
// 45°). Ring anchor is offset to (0.38, 0.38) instead of the geometric
// center (0.5, 0.5) to compensate for the rendered emoji glyph offset
// within its em-box — without this shift the cluster visually drifts
// to the bottom-right of the white circle.
const RING_RADIUS = 0.35;
const SLOTS: { x: number; y: number; scale: number }[] = Array.from(
  { length: 8 },
  (_, i) => {
    const angle = (i * Math.PI) / 4;
    return {
      x: 0.39 + RING_RADIUS * Math.sin(angle),
      y: 0.40 - RING_RADIUS * Math.cos(angle),
      scale: i % 2 === 0 ? 1.0 : 0.9,
    };
  }
);

function slotRotation(roundNumber: number, slot: number): number {
  const seed = (roundNumber * 31 + slot * 17) % 60;
  return seed - 30;
}

interface SpotItCardProps {
  symbolIndices: number[];
  roundNumber: number;
  /** Card diameter in pixels. */
  size: number;
  /** If set, the symbol at this *symbol-index* gets a glow ring. */
  highlightSymbolIndex?: number | null;
  /** Optional click handler for controller-side interactive cards. */
  onSymbolClick?: (symbolIndex: number) => void;
  /** Dim the whole card (lockout / waiting). */
  dimmed?: boolean;
}

export function SpotItCard({
  symbolIndices,
  roundNumber,
  size,
  highlightSymbolIndex = null,
  onSymbolClick,
  dimmed = false,
}: SpotItCardProps) {
  const symbolBaseSize = size * 0.17;
  const interactive = !!onSymbolClick;

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: dimmed ? 0.45 : 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#fff',
        boxShadow:
          '0 10px 40px rgba(0,0,0,0.35), inset 0 0 0 6px #FAF6F0, inset 0 0 0 8px #E6DCD2',
        flexShrink: 0,
        clipPath: 'circle(50%)',
      }}
    >
      {symbolIndices.slice(0, SLOTS.length).map((symbolIndex, slot) => {
        const pos = SLOTS[slot];
        const rotation = slotRotation(roundNumber, slot);
        const isMatch = highlightSymbolIndex === symbolIndex;
        const emoji = SPOT_IT_SYMBOLS[symbolIndex] ?? '?';

        const symbolEl = (
          <span
            style={{
              fontSize: symbolBaseSize * pos.scale,
              lineHeight: 1,
              display: 'inline-block',
              transform: `rotate(${rotation}deg)`,
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            {emoji}
          </span>
        );

        const commonStyle: React.CSSProperties = {
          position: 'absolute',
          left: `${pos.x * 100}%`,
          top: `${pos.y * 100}%`,
          transform: 'translate(-50%, -50%)',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: interactive ? 'pointer' : 'default',
          WebkitTapHighlightColor: 'transparent',
        };

        const glow: React.CSSProperties = isMatch
          ? {
              filter:
                'drop-shadow(0 0 12px #E9C36A) drop-shadow(0 0 24px #C29B47)',
            }
          : {};

        if (interactive) {
          return (
            <motion.button
              key={slot}
              type="button"
              onClick={() => onSymbolClick!(symbolIndex)}
              animate={isMatch ? { scale: [1, 1.25, 1] } : { scale: 1 }}
              transition={{ duration: 0.6, repeat: isMatch ? Infinity : 0 }}
              style={{ ...commonStyle, ...glow }}
            >
              {symbolEl}
            </motion.button>
          );
        }

        return (
          <motion.div
            key={slot}
            animate={isMatch ? { scale: [1, 1.25, 1] } : { scale: 1 }}
            transition={{ duration: 0.6, repeat: isMatch ? Infinity : 0 }}
            style={{ ...commonStyle, ...glow }}
          >
            {symbolEl}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
