import { motion, AnimatePresence } from 'framer-motion';
import type { QuizLeaderboardEntry } from '@igra/shared';

interface LeaderboardProps {
  entries: QuizLeaderboardEntry[];
  isFinal: boolean;
}

export function Leaderboard({ entries, isFinal }: LeaderboardProps) {
  return (
    <div style={{ width: '100%', maxWidth: '600px' }}>
      <h2
        style={{
          textAlign: 'center',
          fontSize: '1.8rem',
          marginBottom: '1.5rem',
          color: isFinal ? 'var(--success)' : 'var(--text-primary)',
        }}
      >
        {isFinal ? 'Konačni poredak' : 'Rang lista'}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <AnimatePresence mode="popLayout">
          {entries.map((entry) => (
            <motion.div
              key={entry.playerId}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                background: 'var(--bg-card)',
                borderRadius: '0.75rem',
                padding: '1rem 1.5rem',
                borderLeft: `4px solid ${entry.avatarColor}`,
              }}
            >
              <span
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: entry.rank <= 3 ? 'var(--accent)' : 'var(--text-secondary)',
                  minWidth: '2rem',
                  textAlign: 'center',
                }}
              >
                {entry.rank === 1 && isFinal ? '🏆' : `#${entry.rank}`}
              </span>

              <div
                style={{
                  width: '0.75rem',
                  height: '0.75rem',
                  borderRadius: '50%',
                  backgroundColor: entry.avatarColor,
                  flexShrink: 0,
                }}
              />

              <span style={{ flex: 1, fontSize: '1.2rem', fontWeight: 600 }}>
                {entry.name}
              </span>

              <span
                style={{
                  fontSize: '1.3rem',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: 'var(--accent)',
                }}
              >
                {entry.score.toLocaleString()}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
