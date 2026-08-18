import { motion } from 'framer-motion';
import type { FibbageResultData } from '@igra/shared';
import { useRoomStore } from '../../../store/roomStore';

interface ResultsRevealProps {
  results: FibbageResultData;
}

/** Seconds between two consecutive options coming up. */
const STAGGER = 0.35;

export function ResultsReveal({ results }: ResultsRevealProps) {
  const players = useRoomStore((s) => s.players);
  const { realAnswer, revealOptions } = results;

  const playerById = (id: string) => players.find((p) => p.id === id);

  // The server hands them over already sorted — lies nobody picked first,
  // then by rising vote count, truth last — so the reveal builds instead of
  // dumping everything at once and the real answer is the punchline.
  const truthDelay = revealOptions.length * STAGGER;

  return (
    <div style={{ width: '100%', maxWidth: '820px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {revealOptions.map((opt, i) => {
          const voters = opt.voterPlayerIds;
          return (
            <motion.div
              key={opt.id}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * STAGGER, duration: 0.35 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.85rem 1.25rem',
                background: opt.isReal
                  ? 'rgba(47,224,138,.12)'
                  : 'var(--bg-card)',
                borderRadius: '0.75rem',
                border: opt.isReal
                  ? '2px solid var(--success)'
                  : '2px solid transparent',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: opt.isReal ? 'var(--success)' : 'var(--text-primary)',
                  }}
                >
                  {opt.text}
                  {opt.isReal && (
                    <span
                      style={{
                        marginLeft: '0.6rem',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        color: 'var(--success)',
                      }}
                    >
                      ✓ ISTINA
                    </span>
                  )}
                </div>

                {/* Every lie is attributed, including the ones nobody picked —
                    the old reveal named only the successful liars, which threw
                    away the funniest half of the round. */}
                {!opt.isReal && opt.authorNames.length > 0 && (
                  <div
                    style={{
                      fontSize: '0.9rem',
                      color: 'var(--text-secondary)',
                      marginTop: '0.15rem',
                    }}
                  >
                    🤥 {opt.authorNames.join(', ')}
                    {opt.pointsEarned > 0 && (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          fontWeight: 800,
                          color: 'var(--accent)',
                        }}
                      >
                        +{opt.pointsEarned}
                      </span>
                    )}
                    {voters.length === 0 && (
                      <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
                        · niko nije poverovao
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div
                style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}
              >
                {voters.map((voterId) => {
                  const p = playerById(voterId);
                  return (
                    <div
                      key={voterId}
                      title={p?.name ?? ''}
                      style={{
                        width: '1.8rem',
                        height: '1.8rem',
                        borderRadius: '50%',
                        backgroundColor: p?.avatarColor ?? '#666',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1rem',
                      }}
                    >
                      {p?.avatarEmoji}
                    </div>
                  );
                })}
                {voters.length > 0 && (
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
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Restated big underneath, once the list has finished building. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: truthDelay, duration: 0.4 }}
        style={{ textAlign: 'center', marginTop: '1.25rem' }}
      >
        <p
          style={{
            fontSize: '1rem',
            color: 'var(--text-secondary)',
            marginBottom: '0.25rem',
          }}
        >
          Tačan odgovor:
        </p>
        <p style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--success)' }}>
          {realAnswer}
        </p>
      </motion.div>
    </div>
  );
}
