interface AnswerCounterProps {
  answeredCount: number;
  totalPlayers: number;
}

export function AnswerCounter({ answeredCount, totalPlayers }: AnswerCounterProps) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: '2rem',
        padding: '0.5rem 1.5rem',
        fontSize: '1.1rem',
        color: 'var(--text-secondary)',
      }}
    >
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
        {answeredCount}
      </span>
      /{totalPlayers} odgovorilo
    </div>
  );
}
