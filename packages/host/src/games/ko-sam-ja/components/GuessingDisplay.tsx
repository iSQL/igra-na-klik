import { motion } from 'framer-motion';
import type { KoSamJaPublicOption } from '@igra/shared';
import { KO_SAM_JA_FIXED_OPTION_COLORS } from '@igra/shared';

interface GuessingDisplayProps {
  options: KoSamJaPublicOption[];
  guessedCount: number;
  totalGuessers: number;
}

export function GuessingDisplay({
  options,
  guessedCount,
  totalGuessers,
}: GuessingDisplayProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        width: '100%',
        maxWidth: '700px',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          width: '100%',
        }}
      >
        {options.map((option, i) => {
          const color =
            KO_SAM_JA_FIXED_OPTION_COLORS[
              i % KO_SAM_JA_FIXED_OPTION_COLORS.length
            ];
          return (
            <motion.div
              key={option.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              style={{
                background: color,
                borderRadius: '1rem',
                padding: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '80px',
                border: '4px solid transparent',
              }}
            >
              <span
                style={{
                  fontSize: '1.3rem',
                  fontWeight: 700,
                  color: '#fff',
                  textAlign: 'center',
                }}
              >
                {option.text}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div
        style={{
          textAlign: 'center',
          padding: '0.75rem 1.5rem',
          background: 'var(--bg-secondary)',
          borderRadius: '0.75rem',
        }}
      >
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            margin: 0,
          }}
        >
          Pogađa
        </p>
        <p
          style={{
            fontSize: '1.6rem',
            fontWeight: 800,
            color: 'var(--accent)',
            margin: 0,
          }}
        >
          {guessedCount}/{totalGuessers}
        </p>
      </div>
    </div>
  );
}
