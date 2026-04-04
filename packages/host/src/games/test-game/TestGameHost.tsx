import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';

export default function TestGameHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);

  if (!gameState) return null;

  const winnerId = gameState.data.winnerId as string | null;
  const winnerName = gameState.data.winnerName as string | null;
  const isEnded = gameState.phase === 'ended';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: '2.5rem' }}>Test Game</h1>

      {!isEnded && (
        <>
          <p style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>
            First player to press the button wins!
          </p>
          <div
            style={{
              fontSize: '4rem',
              fontWeight: 800,
              color: 'var(--accent)',
              fontFamily: 'monospace',
            }}
          >
            {Math.ceil(gameState.timeRemaining)}s
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {players.map((p) => (
              <span
                key={p.id}
                style={{
                  background: 'var(--bg-card)',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  borderLeft: `4px solid ${p.avatarColor}`,
                }}
              >
                {p.name}
              </span>
            ))}
          </div>
        </>
      )}

      {isEnded && (
        <div style={{ textAlign: 'center' }}>
          {winnerName ? (
            <>
              <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
                Winner:
              </p>
              <p
                style={{
                  fontSize: '3rem',
                  fontWeight: 800,
                  color: 'var(--success)',
                }}
              >
                {winnerName}
              </p>
            </>
          ) : (
            <p style={{ fontSize: '2rem', color: 'var(--danger)' }}>
              Time's up! Nobody pressed the button.
            </p>
          )}
          <p style={{ marginTop: '2rem', color: 'var(--text-secondary)' }}>
            Returning to lobby...
          </p>
        </div>
      )}
    </div>
  );
}
