import { useEffect, useRef } from 'react';
import type { PublicPlayer } from '@igra/shared';
import { useSound } from '../hooks/useSound';

interface PlayerListProps {
  players: PublicPlayer[];
}

export function PlayerList({ players }: PlayerListProps) {
  const { play } = useSound();
  const prevCountRef = useRef(players.length);

  useEffect(() => {
    if (players.length > prevCountRef.current) {
      play('join');
    }
    prevCountRef.current = players.length;
  }, [players.length, play]);
  if (players.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
        Waiting for players to join...
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center' }}>
      {players.map((player) => (
        <div
          key={player.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: 'var(--bg-card)',
            borderRadius: '1rem',
            padding: '0.75rem 1.5rem',
            opacity: player.isConnected ? 1 : 0.4,
          }}
        >
          <div
            style={{
              width: '1rem',
              height: '1rem',
              borderRadius: '50%',
              backgroundColor: player.avatarColor,
            }}
          />
          <span style={{ fontSize: '1.3rem', fontWeight: 600 }}>
            {player.name}
          </span>
        </div>
      ))}
    </div>
  );
}
