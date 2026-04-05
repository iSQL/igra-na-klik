import { useState, useRef } from 'react';
import { socket } from '../../../socket';

interface GuessingInputProps {
  hasGuessedCorrectly: boolean;
  hint: string;
  timeRemaining: number;
}

export function GuessingInput({ hasGuessedCorrectly, hint, timeRemaining }: GuessingInputProps) {
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
        <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>
          Tačno!
        </p>
        <p style={{ color: 'var(--text-secondary)' }}>Čekamo ostale...</p>
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
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            letterSpacing: '0.2rem',
            fontFamily: 'monospace',
          }}
        >
          {hint}
        </p>
        <p
          style={{
            fontSize: '1.8rem',
            fontWeight: 800,
            marginTop: '1rem',
            color: timeRemaining <= 10 ? 'var(--danger)' : 'var(--text-primary)',
          }}
        >
          {timeRemaining}s
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
          placeholder="Upiši pokušaj..."
          autoComplete="off"
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '2px solid var(--accent)',
            borderRadius: '12px',
            fontSize: '1rem',
          }}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          style={{
            padding: '0.75rem 1.5rem',
            background: text.trim() ? 'var(--accent)' : 'var(--bg-card)',
            color: '#fff',
            borderRadius: '12px',
            fontSize: '1rem',
            fontWeight: 600,
          }}
        >
          Pogodi
        </button>
      </form>
    </div>
  );
}
