import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';
import type { DveIstineHostData, DveIstineStatement } from '@igra/shared';

export default function DveIstineHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gameState) return;
    const { phase } = gameState;
    if (phase !== prevPhaseRef.current) {
      if (phase === 'showing-results') play('reveal');
      if (phase === 'ended') play('victory');
      prevPhaseRef.current = phase;
    }
  }, [gameState, play]);

  if (!gameState) return null;

  const { phase, timeRemaining, data } = gameState;
  const host = data.host as DveIstineHostData;
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';

  if (phase === 'collecting') {
    return (
      <Center>
        <motion.p
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '2.4rem', fontWeight: 800, textAlign: 'center' }}
        >
          Dve istine i jedna laž
        </motion.p>
        <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
          Napišite dve istinite i jednu izmišljenu stvar o sebi na telefonima.
        </p>
        <p style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)' }}>
          {host.submittedCount}/{host.totalSubmitters} poslalo · {timeRemaining}s
        </p>
      </Center>
    );
  }

  if (phase === 'guessing') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          padding: '1.5rem',
          width: '100%',
          height: '100%',
        }}
      >
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds}
        </p>
        <p style={{ fontSize: '2rem', fontWeight: 800 }}>
          {emojiFor(host.subjectId ?? '')} {host.subjectName}
        </p>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          Koja je laž? Glasajte na telefonima · {host.guessedCount}/{host.totalGuessers} · {timeRemaining}s
        </p>
        <StatementCards statements={host.statements ?? []} />
      </div>
    );
  }

  if (phase === 'showing-results') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          padding: '1.5rem',
          width: '100%',
          height: '100%',
          overflowY: 'auto',
        }}
      >
        <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
          {emojiFor(host.subjectId ?? '')} {host.subjectName}
        </p>
        <StatementCards statements={host.statements ?? []} lieIndex={host.lieIndex} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', maxWidth: '760px' }}>
          {host.results?.map((r) => (
            <span
              key={r.playerId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.7rem',
                borderRadius: '0.6rem',
                background: 'var(--bg-card)',
                borderLeft: `4px solid ${r.avatarColor}`,
                fontWeight: 600,
                fontSize: '0.95rem',
                opacity: r.guessedIndex === null ? 0.5 : 1,
              }}
            >
              {emojiFor(r.playerId)} {r.name}{' '}
              <span style={{ color: r.correct ? '#7be37b' : '#e74c3c' }}>
                {r.guessedIndex === null ? '—' : r.correct ? '✓' : '✗'}
              </span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'ended' && host.leaderboard) {
    return (
      <Center>
        <p style={{ fontSize: '1.6rem', fontWeight: 800 }}>Konačni poredak</p>
        <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {host.leaderboard.map((entry) => (
            <div
              key={entry.playerId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--accent)', minWidth: '2ch' }}>
                  #{entry.rank}
                </span>
                <div
                  style={{
                    width: '1.75rem',
                    height: '1.75rem',
                    borderRadius: '50%',
                    background: entry.avatarColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                  }}
                >
                  {emojiFor(entry.playerId)}
                </div>
                <span style={{ fontWeight: 600 }}>{entry.name}</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                {entry.score.toLocaleString()} poena
              </span>
            </div>
          ))}
        </div>
      </Center>
    );
  }

  return null;
}

function StatementCards({
  statements,
  lieIndex,
}: {
  statements: DveIstineStatement[];
  lieIndex?: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        width: '100%',
        maxWidth: '760px',
      }}
    >
      {statements.map((s) => {
        const revealed = lieIndex !== undefined;
        const isLie = revealed && s.index === lieIndex;
        return (
          <div
            key={s.index}
            style={{
              padding: '1.1rem 1.4rem',
              borderRadius: '14px',
              background: 'var(--bg-secondary)',
              fontSize: '1.5rem',
              fontWeight: 600,
              border: revealed
                ? isLie
                  ? '3px solid #e74c3c'
                  : '3px solid rgba(123,227,123,0.6)'
                : '3px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <span>{s.text}</span>
            {revealed && (
              <span
                style={{
                  fontSize: '1rem',
                  fontWeight: 800,
                  color: isLie ? '#e74c3c' : '#7be37b',
                  whiteSpace: 'nowrap',
                }}
              >
                {isLie ? 'LAŽ ✗' : 'ISTINA ✓'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1rem',
        padding: '1.5rem',
      }}
    >
      {children}
    </div>
  );
}
