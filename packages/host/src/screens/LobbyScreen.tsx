import { GAME_DEFINITIONS } from '@igra/shared';
import { useRoomStore } from '../store/roomStore';
import { PlayerList } from '../components/PlayerList';
import { QRCodeDisplay } from '../components/QRCodeDisplay';

// Lowest minPlayers across all registered games — gate the lobby on this so
// solo-friendly games (test-game, geo-pogodi) aren't blocked by a hard 2.
const MIN_PLAYERS_OVERALL = Math.min(
  ...Object.values(GAME_DEFINITIONS).map((g) => g.minPlayers)
);

export function LobbyScreen() {
  const { room, players, setStatus, remoteHostPlayerId } = useRoomStore();

  if (!room) return null;

  const canStart = players.length >= MIN_PLAYERS_OVERALL;
  const remoteHostName = remoteHostPlayerId
    ? players.find((p) => p.id === remoteHostPlayerId)?.name
    : null;

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

      {remoteHostName && (
        <div
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--bg-card)',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            color: 'var(--text-secondary)',
          }}
        >
          🎮 <strong style={{ color: 'var(--accent)' }}>{remoteHostName}</strong>{' '}
          drži kontrolu sa telefona
        </div>
      )}

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
        {canStart
          ? 'Choose Game'
          : `Need at least ${MIN_PLAYERS_OVERALL} player${MIN_PLAYERS_OVERALL === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}
