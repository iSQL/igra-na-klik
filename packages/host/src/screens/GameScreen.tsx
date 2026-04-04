import { GameRouter } from '../components/GameRouter';
import { socket } from '../socket';

export function GameScreen() {
  const handleStop = () => {
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
        }}
      >
        Stop Game
      </button>
      <GameRouter />
    </div>
  );
}
