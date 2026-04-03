import { usePlayerStore } from '../store/playerStore';

export function LobbyScreen() {
  const { player, room } = usePlayerStore();

  if (!player || !room) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
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

      <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
        Waiting for host to start the game...
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
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
            </span>
          ))}
      </div>
    </div>
  );
}
