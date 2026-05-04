import { usePlayerStore } from '../store/playerStore';
import { useNavStore } from '../store/navStore';
import { socket } from '../socket';

export function LobbyScreen() {
  const { player, room, reset } = usePlayerStore();
  const setScreen = useNavStore((s) => s.setScreen);

  const handleLeave = () => {
    reset();
    socket.disconnect();
    socket.connect();
  };

  if (!player || !room) return null;

  const remoteHostId = room.remoteHostPlayerId;
  const iAmRemoteHost = remoteHostId === player.id;
  const holder = remoteHostId
    ? room.players.find((p) => p.id === remoteHostId)
    : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '5rem',
          height: '5rem',
          borderRadius: '50%',
          backgroundColor: player.avatarColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          fontWeight: 700,
        }}
      >
        {player.name[0]}
      </div>

      <h1 style={{ fontSize: '1.5rem' }}>{player.name}</h1>

      <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
        Room <strong style={{ color: 'var(--accent)' }}>{room.code}</strong>
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          alignItems: 'center',
        }}
      >
        {iAmRemoteHost ? (
          <>
            <button
              onClick={() => setScreen('game-select')}
              style={{
                padding: '0.85rem 1.6rem',
                fontSize: '1.05rem',
                fontWeight: 700,
                borderRadius: '0.75rem',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
              }}
            >
              Izaberi igru →
            </button>
            <button
              onClick={() => socket.emit('player:release-remote-host')}
              style={{
                padding: '0.4rem 0.9rem',
                fontSize: '0.85rem',
                borderRadius: '0.5rem',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--bg-card)',
              }}
            >
              Otpusti kontrolu
            </button>
          </>
        ) : holder ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
            🎮 <strong>{holder.name}</strong> drži kontrolu
          </p>
        ) : (
          <button
            onClick={() => socket.emit('player:claim-remote-host')}
            style={{
              padding: '0.7rem 1.3rem',
              fontSize: '0.95rem',
              fontWeight: 700,
              borderRadius: '0.6rem',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
            }}
          >
            Preuzmi kontrolu
          </button>
        )}
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          {iAmRemoteHost
            ? 'Možeš pokrenuti igru sa telefona.'
            : 'Čekamo da domaćin pokrene igru...'}
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          justifyContent: 'center',
        }}
      >
        {room.players
          .filter((p) => 'name' in p)
          .map((p) => (
            <span
              key={p.id}
              style={{
                background: 'var(--bg-card)',
                padding: '0.4rem 0.8rem',
                borderRadius: '0.5rem',
                fontSize: '0.9rem',
              }}
            >
              {p.name}
              {p.id === remoteHostId && ' 🎮'}
            </span>
          ))}
      </div>

      <button
        onClick={handleLeave}
        style={{
          marginTop: '0.5rem',
          padding: '0.6rem 1.5rem',
          fontSize: '0.95rem',
          fontWeight: 600,
          borderRadius: '0.75rem',
          background: 'transparent',
          color: 'var(--text-secondary)',
          border: '1px solid var(--bg-card)',
        }}
      >
        Napusti sobu
      </button>
    </div>
  );
}
