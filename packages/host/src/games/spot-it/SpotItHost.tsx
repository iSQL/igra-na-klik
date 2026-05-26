import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';
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

export default function SpotItHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);
  const { play } = useSound();
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
          Runda {roundNumber} / {totalRounds}
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
            Spremi se…
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
              Pronađi simbol koji se ponavlja na tvojoj karti!
            </p>
            {totalPlayers > 0 && (
              <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
                {tappedCount} / {totalPlayers} pokušalo
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
                    +{roundResult.pointsAwarded[roundResult.winnerId] ?? 0} poena
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
                Niko nije pronašao! ⏱️
              </p>
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
