interface WordPickerProps {
  words: string[];
  onPick: (index: number) => void;
}

export function WordPicker({ words, onPick }: WordPickerProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1.5rem',
        padding: '1rem',
      }}
    >
      <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>Izaberi reč za crtanje</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '300px' }}>
        {words.map((word, i) => (
          <button
            key={i}
            onClick={() => onPick(i)}
            style={{
              padding: '1rem',
              fontSize: '1.2rem',
              fontWeight: 700,
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              borderRadius: '12px',
              textTransform: 'capitalize',
            }}
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}
