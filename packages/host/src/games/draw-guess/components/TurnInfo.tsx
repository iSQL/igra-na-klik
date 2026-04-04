interface TurnInfoProps {
  drawerName: string;
  turnNumber: number;
  totalTurns: number;
  timeRemaining: number;
  correctCount: number;
  totalGuessers: number;
}

export function TurnInfo({
  drawerName,
  turnNumber,
  totalTurns,
  timeRemaining,
  correctCount,
  totalGuessers,
}: TurnInfoProps) {
  const timeColor = timeRemaining <= 10 ? 'var(--danger)' : 'var(--text-primary)';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        maxWidth: '850px',
        padding: '0 0.5rem',
      }}
    >
      <div>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Turn {turnNumber}/{totalTurns}
        </span>
        <span style={{ margin: '0 0.75rem', color: 'var(--text-secondary)' }}>|</span>
        <span style={{ fontSize: '1rem', fontWeight: 600 }}>
          {drawerName} is drawing
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <span style={{ fontSize: '0.9rem', color: 'var(--success)' }}>
          {correctCount}/{totalGuessers} guessed
        </span>
        <span
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: timeColor,
            minWidth: '3ch',
            textAlign: 'right',
          }}
        >
          {timeRemaining}
        </span>
      </div>
    </div>
  );
}
