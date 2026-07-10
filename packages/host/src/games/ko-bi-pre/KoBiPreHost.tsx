import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';
import type { KoBiPreHostData } from '@igra/shared';

export default function KoBiPreHost() {
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
  const host = data.host as KoBiPreHostData;
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';

  if (phase === 'voting') {
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds}
        </p>
        <motion.p
          key={host.prompt}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            fontSize: '3rem',
            fontWeight: 800,
            textAlign: 'center',
            maxWidth: '900px',
          }}
        >
          {host.prompt}
        </motion.p>
        <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
          Glasajte na telefonima · {host.votedCount}/{host.totalVoters} · {timeRemaining}s
        </p>
      </Center>
    );
  }

  if (phase === 'showing-results') {
    const maxVotes = Math.max(1, ...(host.voteTally ?? []).map((v) => v.votes));
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
        <p style={{ fontSize: '1.4rem', fontWeight: 700, textAlign: 'center', maxWidth: '900px' }}>
          {host.prompt}
        </p>
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '2rem', fontWeight: 800 }}
        >
          👑 {host.topNames?.join(', ')}
        </motion.p>
        <div style={{ width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {host.voteTally?.map((v) => (
            <div key={v.playerId} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ width: '9rem', textAlign: 'right', fontWeight: v.isTop ? 800 : 600 }}>
                  {v.isTop ? '👑 ' : ''}
                  {emojiFor(v.playerId)} {v.name}
                </span>
                <div style={{ flex: 1, height: '1.4rem', background: 'var(--bg-secondary)', borderRadius: '0.4rem', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(v.votes / maxVotes) * 100}%`,
                      height: '100%',
                      background: v.avatarColor,
                      transition: 'width 0.4s',
                    }}
                  />
                </div>
                <span style={{ width: '2rem', fontWeight: 700 }}>{v.votes}</span>
              </div>
              {v.voters.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', paddingLeft: '9.6rem' }}>
                  {v.voters.map((voter) => (
                    <span
                      key={voter.playerId}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.15rem 0.55rem 0.15rem 0.2rem',
                        borderRadius: '999px',
                        background: 'var(--bg-secondary)',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                      }}
                    >
                      <span
                        style={{
                          width: '1.3rem',
                          height: '1.3rem',
                          borderRadius: '50%',
                          background: voter.avatarColor,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '0.8rem',
                        }}
                      >
                        {voter.avatarEmoji}
                      </span>
                      {voter.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
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
      }}
    >
      {children}
    </div>
  );
}
