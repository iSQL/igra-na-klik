interface VoteCounterProps {
  votedCount: number;
  totalPlayers: number;
}

export function VoteCounter({ votedCount, totalPlayers }: VoteCounterProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '0.75rem 1.5rem',
        background: 'var(--bg-secondary)',
        borderRadius: '0.75rem',
      }}
    >
      <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>
        {votedCount}/{totalPlayers} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>glasalo</span>
      </p>
    </div>
  );
}
