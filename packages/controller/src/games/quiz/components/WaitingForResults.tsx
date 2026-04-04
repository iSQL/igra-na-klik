interface WaitingForResultsProps {
  selectedIndex: number;
  optionColor: string;
}

export function WaitingForResults({ selectedIndex, optionColor }: WaitingForResultsProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: optionColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
        }}
      >
        ✓
      </div>
      <p style={{ fontSize: '1.3rem', fontWeight: 600 }}>Answer locked in!</p>
      <p style={{ color: 'var(--text-secondary)' }}>Waiting for results...</p>
    </div>
  );
}
