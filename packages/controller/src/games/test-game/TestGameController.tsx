import { socket } from '../../socket';
import { useGameStore } from '../../store/gameStore';

export default function TestGameController() {
  const gameState = useGameStore((s) => s.gameState);

  if (!gameState) return null;

  const isEnded = gameState.phase === 'ended';
  const winnerName = gameState.data.winnerName as string | null;

  const handlePress = () => {
    socket.emit('game:player-action', { action: 'press', data: {} });
  };

  if (isEnded) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        {winnerName ? (
          <p style={{ fontSize: '1.5rem', color: 'var(--success)' }}>
            {winnerName} won!
          </p>
        ) : (
          <p style={{ fontSize: '1.5rem', color: 'var(--danger)' }}>
            Time's up!
          </p>
        )}
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
          Returning to lobby...
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1.5rem',
        padding: '2rem',
      }}
    >
      <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
        Be the first to press!
      </p>
      <button
        onClick={handlePress}
        style={{
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          fontSize: '1.5rem',
          fontWeight: 700,
          background: 'var(--accent)',
          color: '#fff',
          boxShadow: '0 8px 24px rgba(108, 99, 255, 0.4)',
          transition: 'transform 0.1s',
        }}
        onTouchStart={(e) => {
          e.currentTarget.style.transform = 'scale(0.93)';
        }}
        onTouchEnd={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        PRESS ME!
      </button>
    </div>
  );
}
