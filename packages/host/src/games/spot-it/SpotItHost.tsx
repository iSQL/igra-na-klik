import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';
import { useT } from '../../i18n/useT';
import { SPOT_IT_SYMBOLS } from '@igra/shared';
import { SpotItCard } from './components/SpotItCard';
import { Leaderboard } from '../quiz/components/Leaderboard';
import type { QuizLeaderboardEntry } from '@igra/shared';

interface RoundResult {
  winnerId: string | null;
  winnerName: string | null;
  winnerAvatarColor: string | null;
  matchSymbolIndex: number | null;
  pointsAwarded: Record<string, number>;
}

interface Standing {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  roundPoints: number;
  totalScore: number;
  rank: number;
}

export default function SpotItHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);
  const { play } = useSound();
  const t = useT();
  const prevPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gameState) return;
    const phase = gameState.phase;
    if (phase !== prevPhaseRef.current) {
      if (phase === 'racing') play('tick');
      if (phase === 'round-results') play('reveal');
      if (phase === 'ended') play('victory');
      prevPhaseRef.current = phase;
    }
  }, [gameState, play]);

  if (!gameState) return null;

  const { phase, timeRemaining, data } = gameState;
  const roundNumber = (data.roundNumber as number) ?? 1;
  const totalRounds = (data.totalRounds as number) ?? 10;
  const centerCard = (data.centerCard as number[] | undefined) ?? null;
  const roundResult = (data.roundResult as RoundResult | undefined) ?? null;
  const standings = (data.standings as Standing[] | undefined) ?? null;
  const leaderboard = (data.leaderboard as QuizLeaderboardEntry[] | undefined) ?? null;
  const tappedCount = (data.tappedCount as number | undefined) ?? 0;
  const totalPlayers = (data.totalPlayers as number | undefined) ?? 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        padding: '2rem',
        width: '100%',
        maxWidth: '900px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span>
          {t('spotIt.round', { n: roundNumber, total: totalRounds })}
        </span>
        {phase === 'racing' && (
          <>
            <span style={{ opacity: 0.5 }}>•</span>
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 700,
                color: timeRemaining <= 5 ? 'var(--danger)' : 'var(--text-primary)',
                fontSize: '1.4rem',
              }}
            >
              {timeRemaining}s
            </span>
          </>
        )}
      </div>

      {centerCard && phase !== 'final-leaderboard' && phase !== 'ended' && (
        <SpotItCard
          symbolIndices={centerCard}
          roundNumber={roundNumber}
          size={480}
          highlightSymbolIndex={
            phase === 'round-results'
              ? roundResult?.matchSymbolIndex ?? null
              : null
          }
        />
      )}

      <AnimatePresence mode="wait">
        {phase === 'card-reveal' && (
          <motion.p
            key="reveal-text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              fontSize: '1.6rem',
              fontWeight: 700,
              color: 'var(--accent)',
              margin: 0,
            }}
          >
            {t('spotIt.getReady')}
          </motion.p>
        )}

        {phase === 'racing' && (
          <motion.div
            key="racing-text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <p
              style={{
                fontSize: '1.2rem',
                color: 'var(--text-secondary)',
                margin: 0,
              }}
            >
              {t('spotIt.findSymbol')}
            </p>
            {totalPlayers > 0 && (
              <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
                {t('spotIt.triedCount', { n: tappedCount, total: totalPlayers })}
              </p>
            )}
          </motion.div>
        )}

        {phase === 'round-results' && roundResult && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            {roundResult.winnerId ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: 'var(--bg-card)',
                  borderRadius: '0.75rem',
                  padding: '1rem 1.5rem',
                  borderLeft: `4px solid ${
                    roundResult.winnerAvatarColor ?? 'var(--accent)'
                  }`,
                }}
              >
                <span style={{ fontSize: '2rem' }}>🏆</span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                    {players.find((p) => p.id === roundResult.winnerId)
                      ?.avatarEmoji}{' '}
                    {roundResult.winnerName}
                  </span>
                  <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
                    +{roundResult.pointsAwarded[roundResult.winnerId] ?? 0} {t('common.points')}
                  </span>
                </div>
                {roundResult.matchSymbolIndex !== null && (
                  <span style={{ fontSize: '2.2rem', marginLeft: '0.5rem' }}>
                    {SPOT_IT_SYMBOLS[roundResult.matchSymbolIndex]}
                  </span>
                )}
              </div>
            ) : (
              <p
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  margin: 0,
                }}
              >
                {t('spotIt.nobodyFound')}
              </p>
            )}

            {standings && standings.length > 0 && (
              <div style={{ width: '100%', maxWidth: '460px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <p
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                    margin: '0.25rem 0 0',
                  }}
                >
                  {t('spotIt.standings')}
                </p>
                {standings.map((s) => (
                  <div
                    key={s.playerId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      padding: '0.5rem 0.85rem',
                      background: 'var(--bg-card)',
                      borderRadius: '0.6rem',
                      borderLeft: `5px solid ${s.avatarColor}`,
                    }}
                  >
                    <span style={{ fontWeight: 800, color: 'var(--accent)', minWidth: '1.6rem' }}>
                      #{s.rank}
                    </span>
                    <span style={{ flex: 1, fontWeight: 600 }}>
                      {s.avatarEmoji} {s.name}
                    </span>
                    {s.roundPoints > 0 && (
                      <span style={{ fontWeight: 700, color: 'var(--success)', minWidth: '3.5ch', textAlign: 'right' }}>
                        +{s.roundPoints}
                      </span>
                    )}
                    <span style={{ fontWeight: 800, minWidth: '4ch', textAlign: 'right' }}>
                      {s.totalScore.toLocaleString('sr-Latn-RS')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {(phase === 'final-leaderboard' || phase === 'ended') && leaderboard && (
          <motion.div
            key="final"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ width: '100%' }}
          >
            <Leaderboard entries={leaderboard} isFinal={true} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
