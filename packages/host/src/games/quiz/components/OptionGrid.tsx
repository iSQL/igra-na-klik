import { motion } from 'framer-motion';
import type { QuizOption } from '@igra/shared';

interface OptionGridProps {
  options: QuizOption[];
  correctIndex?: number | null;
  showResults: boolean;
  counts?: number[];
}

export function OptionGrid({ options, correctIndex, showResults, counts }: OptionGridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
        width: '100%',
        maxWidth: '700px',
      }}
    >
      {options.map((option) => {
        const isCorrect = showResults && option.index === correctIndex;
        const isWrong = showResults && option.index !== correctIndex;
        const count = counts?.[option.index];

        return (
          <motion.div
            key={option.index}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: isWrong ? 0.4 : 1,
              scale: isCorrect ? 1.05 : 1,
            }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'relative',
              background: option.color,
              borderRadius: '1rem',
              padding: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '80px',
              border: isCorrect ? '4px solid #fff' : '4px solid transparent',
            }}
          >
            <span style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', textAlign: 'center' }}>
              {option.text}
            </span>
            {isCorrect && (
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.1 }}
                style={{
                  position: 'absolute',
                  top: '-0.6rem',
                  right: '-0.6rem',
                  width: '2.4rem',
                  height: '2.4rem',
                  borderRadius: '50%',
                  background: '#fff',
                  color: 'var(--success, #2ecc71)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  fontWeight: 900,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
                }}
              >
                ✓
              </motion.div>
            )}
            {showResults && typeof count === 'number' && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '0.4rem',
                  left: '0.6rem',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.85)',
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: '0.4rem',
                  padding: '0.1rem 0.45rem',
                }}
              >
                {count}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
