import { useEffect, useState } from 'react';
import { GameRouter } from '../components/GameRouter';
import { socket } from '../socket';

export function GameScreen() {
  const [stopping, setStopping] = useState(false);

  // If the component ever remounts with leftover state, clear it.
  useEffect(() => {
    return () => setStopping(false);
  }, []);

  const handleStop = () => {
    if (stopping) return;
    setStopping(true);
    socket.emit('host:stop-game');
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <button
        onClick={handleStop}
        disabled={stopping}
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          padding: '0.5rem 1rem',
          background: 'var(--danger)',
          color: '#fff',
          borderRadius: '8px',
          fontSize: '0.9rem',
          zIndex: 10,
          minHeight: '40px',
          minWidth: '40px',
          opacity: stopping ? 0.6 : 1,
          cursor: stopping ? 'not-allowed' : 'pointer',
        }}
      >
        {stopping ? 'Stopping…' : 'Stop Game'}
      </button>
      <GameRouter />
      {stopping && <StoppingOverlay />}
    </div>
  );
}

function StoppingOverlay() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: '72px',
          height: '72px',
          border: '6px solid rgba(255, 255, 255, 0.2)',
          borderTopColor: '#fff',
          borderRadius: '50%',
          animation: 'igra-spin 0.8s linear infinite',
        }}
      />
      <p style={{ fontSize: '1.5rem', color: '#fff', fontWeight: 500 }}>
        Stopping game…
      </p>
    </div>
  );
}
