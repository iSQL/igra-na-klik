import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SlozilicaHostData } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';

export default function SlozilicaHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);
  const { play } = useSound();
  const prevPhase = useRef<string | null>(null);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase !== prevPhase.current) {
      if (gameState.phase === 'pisanje') play('tick');
      if (gameState.phase === 'rezultati') play('reveal');
      if (gameState.phase === 'ended') play('victory');
      prevPhase.current = gameState.phase;
    }
  }, [gameState, play]);

  if (!gameState) return null;
  const { phase, timeRemaining, data } = gameState;
  const host = data.host as SlozilicaHostData;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        width: '100%',
        height: '100%',
        padding: '1.2rem',
        // Rezultati sa 10 igrača ne smeju da izguraju slova van ekrana.
        overflow: 'hidden',
      }}
    >
      <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>
        RUNDA {host.round}/{host.totalRounds}
      </p>

      <Tiles letters={host.letters} animate={phase === 'najava'} />

      <AnimatePresence mode="wait">
        {phase === 'najava' && (
          <motion.p
            key="najava"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            style={{ fontSize: '1.6rem', color: 'var(--text-secondary)' }}
          >
            Spremite se… {timeRemaining}
          </motion.p>
        )}

        {phase === 'pisanje' && (
          <motion.div
            key="pisanje"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '4.5rem',
                fontWeight: 800,
                color: timeRemaining <= 10 ? 'var(--danger)' : 'var(--text-primary)',
                lineHeight: 1,
              }}
            >
              {timeRemaining}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', justifyContent: 'center' }}>
              {host.foundCounts?.map((f) => {
                const p = players.find((pl) => pl.id === f.playerId);
                return (
                  <div
                    key={f.playerId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.4rem 0.9rem',
                      borderRadius: '999px',
                      background: f.done
                        ? 'rgba(87,179,128,0.28)'
                        : f.count > 0
                          ? 'rgba(87,179,128,0.16)'
                          : 'var(--bg-card)',
                      border: `1px solid ${f.done || f.count > 0 ? 'var(--success)' : 'var(--line)'}`,
                      fontSize: '1.05rem',
                      opacity: f.done ? 1 : 0.95,
                    }}
                  >
                    <span>{p?.avatarEmoji ?? '👤'}</span>
                    <span>{p?.name ?? '?'}</span>
                    <strong style={{ color: 'var(--accent)' }}>{f.count}</strong>
                    {f.done && <span title="gotov">✓</span>}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
              {(() => {
                const total = host.foundCounts?.length ?? 0;
                const done = host.foundCounts?.filter((f) => f.done).length ?? 0;
                return done > 0
                  ? `Slažite reči — gotovo ${done}/${total}, runda se zatvara kad svi završe`
                  : 'Slažite reči na telefonima — računa se najduža!';
              })()}
            </p>
          </motion.div>
        )}

        {(phase === 'rezultati' || phase === 'ended') && (
          <motion.div
            key="rezultati"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.6rem',
              width: 'min(760px, 92%)',
              // Sa punom sobom lista se skroluje unutar sebe, a slova ostaju.
              maxHeight: '58vh',
              overflowY: 'auto',
            }}
          >
            {phase === 'rezultati' && host.bestPossible && host.bestPossible.length > 0 && (
              <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)' }}>
                Najduže moguće:{' '}
                <strong style={{ color: 'var(--accent)', fontSize: '1.4rem' }}>
                  {host.bestPossible[0]}
                </strong>
                {host.bestPossible.length > 1 && (
                  <span style={{ opacity: 0.7 }}> · {host.bestPossible.slice(1, 4).join(', ')}</span>
                )}
              </p>
            )}

            {phase === 'rezultati' &&
              host.results?.map((r, i) => (
                <motion.div
                  key={r.playerId}
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto auto',
                    alignItems: 'center',
                    gap: '0.9rem',
                    width: '100%',
                    padding: '0.55rem 1.1rem',
                    borderRadius: '0.75rem',
                    background: i === 0 && r.points > 0 ? 'rgba(194,155,71,0.18)' : 'var(--bg-card)',
                    border: `1px solid ${i === 0 && r.points > 0 ? 'var(--accent)' : 'var(--line)'}`,
                  }}
                >
                  <span style={{ fontSize: '1.4rem' }}>{r.avatarEmoji}</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{r.name}</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.5rem',
                      letterSpacing: '0.06em',
                      color: r.bestWord ? 'var(--text-primary)' : 'var(--dim)',
                    }}
                  >
                    {r.bestWord || '—'}
                    {r.wordCount > 1 && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {' '}(+{r.wordCount - 1})
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.5rem',
                      color: 'var(--accent)',
                      minWidth: '4rem',
                      textAlign: 'right',
                    }}
                  >
                    +{r.points}
                  </span>
                </motion.div>
              ))}

            {phase === 'ended' && (
              <>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem' }}>
                  Konačni poredak
                </h2>
                {host.leaderboard?.map((e) => (
                  <div
                    key={e.playerId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto auto 1fr auto',
                      alignItems: 'center',
                      gap: '0.9rem',
                      width: '100%',
                      padding: '0.6rem 1.1rem',
                      borderRadius: '0.75rem',
                      background: e.rank === 1 ? 'rgba(194,155,71,0.18)' : 'var(--bg-card)',
                      border: `1px solid ${e.rank === 1 ? 'var(--accent)' : 'var(--line)'}`,
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)', width: '2rem' }}>{e.rank}.</span>
                    <span style={{ fontSize: '1.4rem' }}>{e.avatarEmoji}</span>
                    <span style={{ fontSize: '1.35rem', fontWeight: 700 }}>{e.name}</span>
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.5rem',
                        color: 'var(--accent)',
                      }}
                    >
                      {e.score}
                    </span>
                  </div>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Tiles({ letters, animate }: { letters: string[]; animate: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', justifyContent: 'center' }}>
      {letters.map((letter, i) => (
        <motion.div
          key={`${letter}-${i}`}
          initial={animate ? { rotateY: 90, opacity: 0 } : false}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ delay: animate ? i * 0.12 : 0, type: 'spring', stiffness: 220, damping: 18 }}
          style={{
            width: '3.6rem',
            height: '4.1rem',
            display: 'grid',
            placeItems: 'center',
            borderRadius: '0.55rem',
            background: 'linear-gradient(160deg, #f7efe2, #e4d7c0)',
            color: '#1d3557',
            fontFamily: 'var(--font-display)',
            fontSize: '2.3rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            boxShadow: '0 6px 14px rgba(0,0,0,0.32)',
          }}
        >
          {letter}
        </motion.div>
      ))}
    </div>
  );
}
