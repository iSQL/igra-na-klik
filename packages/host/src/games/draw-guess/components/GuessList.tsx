import { useRef, useEffect } from 'react';
import type { DrawGuessGuess } from '@igra/shared';
import { useT } from '../../../i18n/useT';

interface GuessListProps {
  guesses: DrawGuessGuess[];
}

export function GuessList({ guesses }: GuessListProps) {
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [guesses.length]);

  return (
    <div
      ref={listRef}
      style={{
        width: '240px',
        flexShrink: 0,
        alignSelf: 'stretch',
        overflowY: 'auto',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}
    >
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.25rem' }}>
        {t('drawGuess.attempts')}
      </p>
      {guesses.length === 0 && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          {t('drawGuess.noAttempts')}
        </p>
      )}
      {guesses.map((g, i) => (
        <div
          key={i}
          style={{
            fontSize: '0.85rem',
            color: g.correct ? 'var(--success)' : 'var(--text-primary)',
            fontWeight: g.correct ? 700 : 400,
          }}
        >
          <span style={{ fontWeight: 600 }}>{g.playerName}:</span>{' '}
          {g.correct ? t('drawGuess.guessedIt') : g.text}
        </div>
      ))}
    </div>
  );
}
