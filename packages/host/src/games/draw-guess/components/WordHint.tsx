import { useT } from '../../../i18n/useT';

interface WordHintProps {
  hint: string;
  wordLength: number;
  revealed?: boolean;
  word?: string;
}

export function WordHint({ hint, wordLength, revealed, word }: WordHintProps) {
  const t = useT();
  return (
    <div style={{ textAlign: 'center' }}>
      <p
        style={{
          fontSize: '2rem',
          fontWeight: 700,
          letterSpacing: '0.3rem',
          fontFamily: 'monospace',
          color: revealed ? 'var(--success)' : 'var(--text-primary)',
        }}
      >
        {revealed && word ? word : hint}
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
        {t('drawGuess.letters', { n: wordLength })}
      </p>
    </div>
  );
}
