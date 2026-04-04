import { motion } from 'framer-motion';
import type { QuizOption } from '@igra/shared';

interface OptionGridProps {
  options: QuizOption[];
  correctIndex?: number | null;
  showResults: boolean;
}

export function OptionGrid({ options, correctIndex, showResults }: OptionGridProps) {
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
          </motion.div>
        );
      })}
    </div>
  );
}
