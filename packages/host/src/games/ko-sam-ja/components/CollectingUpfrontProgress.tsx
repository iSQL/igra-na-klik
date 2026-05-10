interface CollectingUpfrontProgressProps {
  collectedCount: number;
  totalRequired: number;
  playersDone: number;
  totalPlayers: number;
  timeRemaining: number;
}

export function CollectingUpfrontProgress({
  collectedCount,
  totalRequired,
  playersDone,
  totalPlayers,
  timeRemaining,
}: CollectingUpfrontProgressProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.25rem',
        width: '100%',
        maxWidth: '700px',
        padding: '2rem',
        background: 'var(--bg-card)',
        borderRadius: '1rem',
        textAlign: 'center',
      }}
    >
      <h2 style={{ fontSize: '1.6rem', margin: 0 }}>Pripremamo igru…</h2>
      <p
        style={{
          fontSize: '1rem',
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        Igrači privatno odgovaraju na svoja lična pitanja na telefonu.
      </p>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            Igrači gotovi
          </p>
          <p
            style={{
              fontSize: '2.4rem',
              fontWeight: 800,
              color: 'var(--accent)',
              margin: 0,
            }}
          >
            {playersDone}/{totalPlayers}
          </p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            Odgovori
          </p>
          <p
            style={{
              fontSize: '2.4rem',
              fontWeight: 800,
              color: 'var(--accent)',
              margin: 0,
            }}
          >
            {collectedCount}/{totalRequired}
          </p>
        </div>
      </div>

      <p
        style={{
          fontSize: '0.95rem',
          color:
            timeRemaining <= 10 ? 'var(--danger)' : 'var(--text-secondary)',
          fontFamily: 'monospace',
          margin: 0,
        }}
      >
        Vreme: {timeRemaining}s
      </p>
    </div>
  );
}
