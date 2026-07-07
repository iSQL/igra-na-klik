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
          style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--success)', margin: 0 }}
        >
          Poslato!
        </p>
        <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>
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
        className="display card"
        style={{
          fontSize: '1.15rem',
          fontWeight: 600,
          lineHeight: 1.3,
          textAlign: 'center',
          padding: '0.9rem 1rem',
          borderRadius: '16px',
          margin: 0,
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
          fontSize: '1.1rem',
          fontWeight: 700,
          padding: '1rem',
          borderRadius: '16px',
          border: '1.5px solid var(--cyan)',
          boxShadow: '0 0 0 4px rgba(111,194,187,.12)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          resize: 'none',
          fontFamily: 'inherit',
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: 'var(--dim)',
        }}
      >
        <span>
          {text.length}/{FIBBAGE_MAX_ANSWER_LENGTH}
        </span>
      </div>

      <button className="btn-primary" onClick={handleSubmit} disabled={!text.trim()}>
        Pošalji ✓
      </button>
    </div>
  );
}
