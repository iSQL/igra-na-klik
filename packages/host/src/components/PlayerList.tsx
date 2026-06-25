import { useEffect, useRef } from 'react';
import type { PublicPlayer } from '@igra/shared';
import { useSound } from '../hooks/useSound';
import { useT } from '../i18n/useT';

interface PlayerListProps {
  players: PublicPlayer[];
  onKick?: (playerId: string) => void;
}

export function PlayerList({ players, onKick }: PlayerListProps) {
  const { play } = useSound();
  const t = useT();
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
        {t('lobby.waitingForPlayers')}
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
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              backgroundColor: player.avatarColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
            }}
          >
            {player.avatarEmoji}
          </div>
          <span style={{ fontSize: '1.3rem', fontWeight: 600 }}>
            {player.name}
          </span>
          {onKick && (
            <button
              onClick={() => {
                if (window.confirm(t('lobby.kickConfirm', { name: player.name }))) {
                  onKick(player.id);
                }
              }}
              title={t('lobby.kick', { name: player.name })}
              aria-label={t('lobby.kick', { name: player.name })}
              style={{
                marginLeft: '0.25rem',
                width: '1.75rem',
                height: '1.75rem',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(231, 76, 60, 0.15)',
                color: '#e74c3c',
                fontSize: '1rem',
                fontWeight: 700,
                lineHeight: 1,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
