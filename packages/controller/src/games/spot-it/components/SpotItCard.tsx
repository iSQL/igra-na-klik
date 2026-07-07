import { motion } from 'framer-motion';
import { SPOT_IT_SYMBOLS } from '@igra/shared';

// 8 slots evenly distributed on a single ring at radius 0.34 from the
// card center (every 45°). Guaranteed symmetric regardless of which
// emoji lands in which slot — no asymmetric clustering when symbols
// have different intrinsic glyph bounds.
const RING_RADIUS = 0.35;
const SLOTS: { x: number; y: number; scale: number }[] = Array.from(
  { length: 8 },
  (_, i) => {
    const angle = (i * Math.PI) / 4;
    return {
      x: 0.38 + RING_RADIUS * Math.sin(angle),
      y: 0.38 - RING_RADIUS * Math.cos(angle),
      // Mild scale variation for visual texture; keeps max emoji extent
      // (0.34 + 0.17·1.05/2 ≈ 0.43) inside the 0.5 circle boundary.
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
  size: number;
  highlightSymbolIndex?: number | null;
  onSymbolClick?: (symbolIndex: number) => void;
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
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: dimmed ? 0.4 : 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#fff',
        boxShadow:
          '0 6px 24px rgba(0,0,0,0.35), inset 0 0 0 4px #FAF6F0, inset 0 0 0 6px #E6DCD2',
        flexShrink: 0,
        touchAction: 'manipulation',
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
              pointerEvents: 'none',
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
          padding: '0.5rem',
          cursor: interactive ? 'pointer' : 'default',
          WebkitTapHighlightColor: 'transparent',
        };

        const glow: React.CSSProperties = isMatch
          ? {
              filter:
                'drop-shadow(0 0 10px #E9C36A) drop-shadow(0 0 20px #C29B47)',
            }
          : {};

        if (interactive) {
          return (
            <motion.button
              key={slot}
              type="button"
              onClick={() => onSymbolClick!(symbolIndex)}
              disabled={dimmed}
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
