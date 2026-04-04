import { motion } from 'framer-motion';
import type { QuizResultData } from '@igra/shared';
import { useRoomStore } from '../../../store/roomStore';

interface ResultsRevealProps {
  results: QuizResultData;
}

export function ResultsReveal({ results }: ResultsRevealProps) {
  const players = useRoomStore((s) => s.players);
  const { question, answers, scores } = results;

  const optionCounts = question.options.map((opt) => ({
    ...opt,
    count: answers.filter((a) => a.optionIndex === opt.index).length,
    isCorrect: opt.index === question.correctIndex,
  }));

  const maxCount = Math.max(...optionCounts.map((o) => o.count), 1);

  return (
    <div style={{ width: '100%', maxWidth: '700px' }}>
      <h3 style={{ textAlign: 'center', fontSize: '1.4rem', marginBottom: '1.5rem' }}>
        {question.text}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
        {optionCounts.map((opt) => (
          <motion.div
            key={opt.index}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, delay: opt.index * 0.1 }}
            style={{ originX: 0 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  flex: 1,
                  background: opt.color,
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  opacity: opt.isCorrect ? 1 : 0.4,
                  border: opt.isCorrect ? '2px solid #fff' : '2px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: '#fff', fontWeight: 600 }}>{opt.text}</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>{opt.count}</span>
              </div>
              <div
                style={{
                  width: `${(opt.count / maxCount) * 100}px`,
                  height: '8px',
                  background: opt.isCorrect ? 'var(--success)' : 'var(--text-secondary)',
                  borderRadius: '4px',
                  minWidth: opt.count > 0 ? '8px' : '0',
                }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
        {scores
          .filter((s) => s.roundScore > 0)
          .sort((a, b) => b.roundScore - a.roundScore)
          .map((s) => {
            const player = players.find((p) => p.id === s.playerId);
            return (
              <motion.div
                key={s.playerId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: '0.5rem',
                  padding: '0.4rem 0.8rem',
                  borderLeft: `3px solid ${player?.avatarColor || '#666'}`,
                }}
              >
                <span style={{ fontWeight: 600 }}>{player?.name}</span>{' '}
                <span style={{ color: 'var(--success)' }}>+{s.roundScore}</span>
              </motion.div>
            );
          })}
      </div>
    </div>
  );
}
