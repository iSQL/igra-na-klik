import { useState } from 'react';
import { socket } from '../../../socket';
import { useHaptics } from '../../../hooks/useHaptics';
import { FIBBAGE_MAX_ANSWER_LENGTH } from '@igra/shared';

interface AnswerInputProps {
  questionText: string;
}

export function AnswerInput({ questionText }: AnswerInputProps) {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const haptics = useHaptics();

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || submitted) return;
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'fibbage:submit-answer',
      data: { text: trimmed },
    });
    setSubmitted(true);
  };

  if (submitted) {
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
        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>
          Poslato!
        </p>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Čekamo ostale...
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '1rem',
        gap: '1rem',
      }}
    >
      <p
        style={{
          fontSize: '1.1rem',
          fontWeight: 600,
          lineHeight: 1.3,
          textAlign: 'center',
        }}
      >
        {questionText}
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, FIBBAGE_MAX_ANSWER_LENGTH))}
        placeholder="Napiši lažan odgovor..."
        autoFocus
        style={{
          flex: 1,
          width: '100%',
          fontSize: '1.2rem',
          padding: '1rem',
          borderRadius: '0.75rem',
          border: '2px solid var(--bg-card)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          resize: 'none',
          fontFamily: 'inherit',
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span>
          {text.length}/{FIBBAGE_MAX_ANSWER_LENGTH}
        </span>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!text.trim()}
        style={{
          background: text.trim() ? 'var(--accent)' : 'var(--bg-card)',
          color: text.trim() ? '#fff' : 'var(--text-secondary)',
          border: 'none',
          borderRadius: '0.75rem',
          padding: '1rem',
          fontSize: '1.3rem',
          fontWeight: 700,
          minHeight: '56px',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        Pošalji
      </button>
    </div>
  );
}
