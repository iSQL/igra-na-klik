import { useRoomStore } from '../../../store/roomStore';

interface TurnResultsProps {
  word: string;
  scores: { playerId: string; playerName: string; avatarColor: string; roundScore: number; totalScore: number }[];
}

export function TurnResults({ word, scores }: TurnResultsProps) {
  const players = useRoomStore((s) => s.players);
  const sorted = [...scores].sort((a, b) => b.roundScore - a.roundScore);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        width: '100%',
        maxWidth: '500px',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Reč je bila</p>
        <p style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--success)' }}>{word}</p>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sorted.map((s) => {
          const emoji = players.find((p) => p.id === s.playerId)?.avatarEmoji;
          return (
          <div
            key={s.playerId}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-secondary)',
              borderRadius: '8px',
              padding: '0.6rem 1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{
                  width: '1.5rem',
                  height: '1.5rem',
                  borderRadius: '50%',
                  background: s.avatarColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                }}
              >
                {emoji}
              </div>
              <span style={{ fontWeight: 600 }}>{s.playerName}</span>
            </div>
            <span
              style={{
                fontWeight: 700,
                color: s.roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
              }}
            >
              +{s.roundScore}
            </span>
          </div>
          );
        })}
      </div>
    </div>
  );
}
