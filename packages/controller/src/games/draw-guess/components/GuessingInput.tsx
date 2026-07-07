import { useState, useRef } from 'react';
import { socket } from '../../../socket';
import { useT } from '../../../i18n/useT';

interface GuessingInputProps {
  hasGuessedCorrectly: boolean;
  hint: string;
  timeRemaining: number;
}

export function GuessingInput({ hasGuessedCorrectly, hint, timeRemaining }: GuessingInputProps) {
  const t = useT();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || hasGuessedCorrectly) return;

    socket.emit('game:player-action', {
      action: 'draw:guess',
      data: { text: text.trim() },
    });
    setText('');
    inputRef.current?.focus();
  };

  if (hasGuessedCorrectly) {
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
        <div
          style={{
            width: '90px',
            height: '90px',
            borderRadius: '50%',
            background: 'var(--success)',
            color: '#04120b',
            display: 'grid',
            placeItems: 'center',
            fontSize: '2.6rem',
            fontWeight: 800,
            boxShadow: '0 0 34px rgba(47,224,138,.5)',
            animation: 'igra-pop .4s',
          }}
        >
          ✓
        </div>
        <p
          className="display"
          style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--success)', margin: 0 }}
        >
          {t('drawGuess.correct')}
        </p>
        <p style={{ color: 'var(--text-secondary)', fontWeight: 700, margin: 0 }}>
          {t('common.waitingForOthers')}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '100%',
        padding: '1.5rem 1rem',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <p
          className="display"
          style={{
            fontSize: '1.6rem',
            fontWeight: 700,
            letterSpacing: '0.25rem',
            color: 'var(--lime)',
            margin: 0,
          }}
        >
          {hint}
        </p>
        <p
          className="display"
          style={{
            fontSize: '1.6rem',
            fontWeight: 700,
            marginTop: '0.8rem',
            color: timeRemaining <= 10 ? 'var(--danger)' : 'var(--amber)',
          }}
        >
          {timeRemaining}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: '0.5rem',
          width: '100%',
          maxWidth: '400px',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('drawGuess.guessPlaceholder')}
          autoComplete="off"
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1.5px solid var(--cyan)',
            boxShadow: '0 0 0 4px rgba(34,222,230,.12)',
            borderRadius: '14px',
            fontSize: '1rem',
            fontWeight: 700,
          }}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          style={{
            padding: '0.75rem 1.5rem',
            background: text.trim() ? 'var(--grad)' : 'var(--bg-card)',
            color: text.trim() ? '#fff' : 'var(--dim)',
            borderRadius: '14px',
            fontSize: '1rem',
            fontWeight: 800,
            boxShadow: text.trim() ? 'var(--shadow-cta)' : 'none',
          }}
        >
          {t('drawGuess.guess')}
        </button>
      </form>
    </div>
  );
}
