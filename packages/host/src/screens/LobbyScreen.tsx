import { useRoomStore } from '../store/roomStore';
import { PlayerList } from '../components/PlayerList';
import { QRCodeDisplay } from '../components/QRCodeDisplay';

export function LobbyScreen() {
  const { room, players, setStatus } = useRoomStore();

  if (!room) return null;

  const canStart = players.length >= 2;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        padding: '2rem',
        width: '100%',
        maxWidth: '900px',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Igra Na Klik</h1>

      <div
        style={{
          fontSize: '5rem',
          fontWeight: 800,
          letterSpacing: '0.5rem',
          color: 'var(--accent)',
          fontFamily: 'monospace',
        }}
      >
        {room.code}
      </div>

      <QRCodeDisplay roomCode={room.code} />

      <div style={{ width: '100%', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.4rem' }}>
          Players ({players.length}/{room.settings.maxPlayers})
        </h2>
        <PlayerList players={players} />
      </div>

      <button
        disabled={!canStart}
        onClick={() => setStatus('game-select')}
        style={{
          padding: '1rem 3rem',
          fontSize: '1.5rem',
          fontWeight: 700,
          borderRadius: '1rem',
          background: canStart ? 'var(--accent)' : '#333',
          color: canStart ? '#fff' : '#666',
          transition: 'background 0.2s',
        }}
      >
        {canStart ? 'Choose Game' : 'Need at least 2 players'}
      </button>
    </div>
  );
}
