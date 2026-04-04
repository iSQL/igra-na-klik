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
      <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{message}</p>
      {subMessage && (
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          {subMessage}
        </p>
      )}
    </div>
  );
}
