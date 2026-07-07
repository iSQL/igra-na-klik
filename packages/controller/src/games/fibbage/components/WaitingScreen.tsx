interface WaitingScreenProps {
  message: string;
  subMessage?: string;
}

export function WaitingScreen({ message, subMessage }: WaitingScreenProps) {
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
        padding: '1rem',
      }}
    >
      <div style={{ display: 'flex', gap: '10px' }}>
        <span
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: 'var(--pink)',
            animation: 'igra-floaty 1.2s infinite',
          }}
        />
        <span
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: 'var(--violet)',
            animation: 'igra-floaty 1.2s infinite .2s',
          }}
        />
        <span
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: 'var(--cyan)',
            animation: 'igra-floaty 1.2s infinite .4s',
          }}
        />
      </div>
      <p className="display" style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>
        {message}
      </p>
      {subMessage && (
        <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>
          {subMessage}
        </p>
      )}
    </div>
  );
}
