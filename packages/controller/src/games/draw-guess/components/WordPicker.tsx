import { useT } from '../../../i18n/useT';

interface WordPickerProps {
  words: string[];
  onPick: (index: number) => void;
}

export function WordPicker({ words, onPick }: WordPickerProps) {
  const t = useT();
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
      <p className="display" style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>
        {t('drawGuess.chooseWord')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '300px' }}>
        {words.map((word, i) => (
          <button
            key={i}
            onClick={() => onPick(i)}
            style={{
              padding: '1rem',
              fontSize: '1.15rem',
              fontWeight: 800,
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1.5px solid var(--line2)',
              borderRadius: '14px',
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
