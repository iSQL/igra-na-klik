interface TurnResultsProps {
  word: string;
  scores: { playerId: string; playerName: string; avatarColor: string; roundScore: number; totalScore: number }[];
}

export function TurnResults({ word, scores }: TurnResultsProps) {
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
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>The word was</p>
        <p style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--success)' }}>{word}</p>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sorted.map((s) => (
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
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: s.avatarColor,
                }}
              />
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
        ))}
      </div>
    </div>
  );
}
