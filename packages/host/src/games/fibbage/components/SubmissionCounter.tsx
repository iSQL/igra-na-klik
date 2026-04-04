interface SubmissionCounterProps {
  submittedCount: number;
  totalPlayers: number;
}

export function SubmissionCounter({
  submittedCount,
  totalPlayers,
}: SubmissionCounterProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '1rem 2rem',
        background: 'var(--bg-secondary)',
        borderRadius: '0.75rem',
      }}
    >
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
        Igrači pišu svoje laži...
      </p>
      <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>
        {submittedCount}/{totalPlayers}
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        napisalo laž
      </p>
    </div>
  );
}
