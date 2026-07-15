import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';
import type { EmojiZagonetkeHostData } from '@igra/shared';

export default function EmojiZagonetkeHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTimeRef = useRef<number>(Infinity);

  useEffect(() => {
    if (!gameState) return;
    const { phase, timeRemaining } = gameState;
    if (phase !== prevPhaseRef.current) {
      if (phase === 'showing-results') play('reveal');
      if (phase === 'ended') play('victory');
      prevPhaseRef.current = phase;
    }
    if (phase === 'answering') {
      const curr = Math.ceil(timeRemaining);
      const prev = Math.ceil(prevTimeRef.current);
      if (curr !== prev && curr <= 5 && curr > 0) play('tick');
    }
    prevTimeRef.current = timeRemaining;
  }, [gameState, play]);

  if (!gameState) return null;

  const { phase, timeRemaining, data } = gameState;
  const host = data.host as EmojiZagonetkeHostData;
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';
  const nameFor = (id: string) =>
    players.find((p) => p.id === id)?.name ?? '—';

  if (phase === 'showing-emojis') {
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds}
        </p>
        <p style={{ fontSize: '1.4rem', color: 'var(--text-secondary)' }}>
          Šta je ovo?
        </p>
        <motion.p
          key={host.emojis}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '6rem', lineHeight: 1.2 }}
        >
          {host.emojis}
        </motion.p>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
          Spremi se da kucaš odgovor na telefonu…
        </p>
      </Center>
    );
  }

  if (phase === 'answering') {
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds} · {timeRemaining}s
        </p>
        <motion.p
          key={host.emojis}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '6rem', lineHeight: 1.2 }}
        >
          {host.emojis}
        </motion.p>
        {host.hint ? (
          <p
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              letterSpacing: '0.15em',
              fontFamily: 'monospace',
              color: 'var(--accent)',
            }}
          >
            {host.hint}
          </p>
        ) : (
          <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
            {host.answerLength} slova
          </p>
        )}
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          {host.answeredCount}/{host.totalPlayers} pogodilo
        </p>
        {(host.solvedIds?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center', maxWidth: 700 }}>
            {host.solvedIds!.map((id) => (
              <span
                key={id}
                style={{
                  padding: '0.3rem 0.7rem',
                  borderRadius: 999,
                  background: 'var(--bg-secondary)',
                  fontSize: '0.95rem',
                }}
              >
                {emojiFor(id)} {nameFor(id)} ✓
              </span>
            ))}
          </div>
        )}
      </Center>
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
        <p style={{ fontSize: '4rem', lineHeight: 1 }}>{host.emojis}</p>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Odgovor</p>
        <motion.p
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)', textAlign: 'center' }}
        >
          {host.answer}
        </motion.p>
        <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {host.results?.map((r) => (
            <div
              key={r.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.45rem 0.7rem',
                background: 'var(--bg-secondary)',
                borderRadius: '0.5rem',
                borderLeft: `5px solid ${r.avatarColor}`,
                opacity: r.correct ? 1 : 0.6,
              }}
            >
              <span style={{ flex: 1, fontWeight: 600 }}>
                {emojiFor(r.playerId)} {r.name}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.correct ? '✓' : r.text ? `✗ ${r.text}` : '—'}
              </span>
              <span style={{ fontWeight: 800, minWidth: '3.5rem', textAlign: 'right', color: r.points > 0 ? '#7be37b' : 'var(--text-secondary)' }}>
                +{r.points}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if ((phase === 'leaderboard' || phase === 'ended') && host.leaderboard) {
    return (
      <Center>
        <p style={{ fontSize: '1.6rem', fontWeight: 800 }}>
          {phase === 'ended' ? 'Konačni poredak' : 'Trenutni poredak'}
        </p>
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {host.leaderboard.map((entry) => (
            <div
              key={entry.playerId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-secondary)',
                borderRadius: 8,
                padding: '0.75rem 1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--accent)', minWidth: '2ch' }}>
                  #{entry.rank}
                </span>
                <span style={{ fontWeight: 600 }}>
                  {emojiFor(entry.playerId)} {entry.name}
                </span>
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
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}
