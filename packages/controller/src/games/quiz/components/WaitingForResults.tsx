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
          width: '90px',
          height: '90px',
          borderRadius: '28px',
          background: optionColor,
          display: 'grid',
          placeItems: 'center',
          fontSize: '2.2rem',
          animation: 'igra-pop .4s',
          boxShadow: `0 0 34px ${optionColor}66`,
        }}
      >
        ✓
      </div>
      <p className="display" style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>
        Odgovor poslat!
      </p>
      <p style={{ color: 'var(--text-secondary)', fontWeight: 700, margin: 0 }}>
        Čekamo rezultate...
      </p>
    </div>
  );
}
