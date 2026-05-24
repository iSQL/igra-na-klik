import { useState } from 'react';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';

interface Props {
  variant?: 'inline' | 'overlay';
}

export function LeaveRoomButton({ variant = 'inline' }: Props) {
  const [confirming, setConfirming] = useState(false);
  const { player, room } = usePlayerStore();

  const iAmRemoteHost =
    !!player && !!room && room.remoteHostPlayerId === player.id;

  const handleConfirm = () => {
    socket.emit('player:leave-room');
    setConfirming(false);
  };

  const triggerStyle: React.CSSProperties =
    variant === 'overlay'
      ? {
          position: 'fixed',
          top: '0.6rem',
          right: '0.6rem',
          zIndex: 50,
          padding: '0.4rem 0.7rem',
          fontSize: '0.8rem',
          fontWeight: 600,
          borderRadius: '0.5rem',
          background: 'rgba(0, 0, 0, 0.55)',
          color: 'var(--text-secondary)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(4px)',
        }
      : {
          padding: '0.6rem 1.5rem',
          fontSize: '0.95rem',
          fontWeight: 600,
          borderRadius: '0.75rem',
          background: 'transparent',
          color: 'var(--text-secondary)',
          border: '1px solid var(--bg-card)',
        };

  return (
    <>
      <button onClick={() => setConfirming(true)} style={triggerStyle}>
        Napusti sobu
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 15, 35, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: '0.9rem',
              padding: '1.4rem',
              maxWidth: '22rem',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              textAlign: 'center',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Napustiti sobu?</h2>
            <p
              style={{
                margin: 0,
                fontSize: '0.95rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
              }}
            >
              {iAmRemoteHost
                ? 'Ti držiš kontrolu — ako izađeš, soba će biti zatvorena i svi ostali igrači će biti izbačeni.'
                : 'Ako izađeš tokom igre, prekinućeš trenutnu rundu za ostale igrače.'}
            </p>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                onClick={() => setConfirming(false)}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  borderRadius: '0.6rem',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--bg-card)',
                }}
              >
                Otkaži
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  flex: 1,
                  padding: '0.7rem',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  borderRadius: '0.6rem',
                  background: '#e74c3c',
                  color: '#fff',
                  border: 'none',
                }}
              >
                Izađi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
