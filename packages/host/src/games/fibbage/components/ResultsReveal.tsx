import { motion } from 'framer-motion';
import type { FibbageResultData } from '@igra/shared';
import { useRoomStore } from '../../../store/roomStore';

interface ResultsRevealProps {
  results: FibbageResultData;
}

export function ResultsReveal({ results }: ResultsRevealProps) {
  const players = useRoomStore((s) => s.players);
  const { realAnswer, realOptionId, options, votes, fools } = results;

  const votesByOption = new Map<string, string[]>();
  for (const v of votes) votesByOption.set(v.optionId, v.voterPlayerIds);

  const playerById = (id: string) => players.find((p) => p.id === id);

  return (
    <div style={{ width: '100%', maxWidth: '800px' }}>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ textAlign: 'center', marginBottom: '1.5rem' }}
      >
        <p
          style={{
            fontSize: '1.1rem',
            color: 'var(--text-secondary)',
            marginBottom: '0.5rem',
          }}
        >
          Tačan odgovor:
        </p>
        <p
          style={{
            fontSize: '2.2rem',
            fontWeight: 800,
            color: 'var(--success)',
          }}
        >
          {realAnswer}
        </p>
      </motion.div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {options.map((opt, i) => {
          const voters = votesByOption.get(opt.id) ?? [];
          const isReal = opt.id === realOptionId;
          return (
            <motion.div
              key={opt.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15, duration: 0.4 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.9rem 1.25rem',
                background: 'var(--bg-card)',
                borderRadius: '0.75rem',
                border: isReal
                  ? '2px solid var(--success)'
                  : '2px solid transparent',
                opacity: isReal || voters.length > 0 ? 1 : 0.55,
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  color: isReal ? 'var(--success)' : 'var(--text-primary)',
                }}
              >
                {opt.text}
                {isReal && (
                  <span
                    style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.85rem',
                      color: 'var(--success)',
                    }}
                  >
                    ✓ istina
                  </span>
                )}
              </span>
              <div
                style={{
                  display: 'flex',
                  gap: '0.3rem',
                  alignItems: 'center',
                }}
              >
                {voters.map((voterId) => {
                  const p = playerById(voterId);
                  return (
                    <div
                      key={voterId}
                      title={p?.name ?? ''}
                      style={{
                        width: '0.85rem',
                        height: '0.85rem',
                        borderRadius: '50%',
                        backgroundColor: p?.avatarColor ?? '#666',
                      }}
                    />
                  );
                })}
                <span
                  style={{
                    minWidth: '1.5rem',
                    textAlign: 'right',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {voters.length}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {fools.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          style={{
            marginTop: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {fools.map((f) => (
            <div
              key={f.optionId}
              style={{
                background: 'var(--bg-secondary)',
                borderRadius: '0.5rem',
                padding: '0.6rem 1rem',
                fontSize: '1rem',
              }}
            >
              <strong>{f.fakerNames.join(', ')}</strong> prevario/la:{' '}
              <span style={{ color: 'var(--accent)' }}>
                {f.fooledPlayerNames.join(', ')}
              </span>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
