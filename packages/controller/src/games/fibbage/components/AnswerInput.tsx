import { useEffect, useState } from 'react';
import { socket } from '../../../socket';
import { useHaptics } from '../../../hooks/useHaptics';
import { FIBBAGE_MAX_ANSWER_LENGTH } from '@igra/shared';
import { PhaseTimer } from './PhaseTimer';

interface AnswerInputProps {
  questionText: string;
  timeRemaining: number;
  duration: number;
  /** How many of the expected players are already in. */
  submittedCount: number;
  totalPlayers: number;
}

export function AnswerInput({
  questionText,
  timeRemaining,
  duration,
  submittedCount,
  totalPlayers,
}: AnswerInputProps) {
  const [text, setText] = useState('');
  // "Sent, waiting for the server to confirm". The success screen is the
  // parent's job, driven by playerData.hasSubmitted — this only stops a
  // double tap. The old version showed a green check off local state alone,
  // so a dropped emit left the player looking at a confirmation for a
  // submission the server never got.
  const [pending, setPending] = useState(false);
  const haptics = useHaptics();

  // The phone keyboard covers most of the screen, so scroll the field into
  // view once it is focused rather than letting the question push it off.
  useEffect(() => {
    const t = setTimeout(() => {
      document
        .getElementById('fibbage-answer')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 300);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'fibbage:submit-answer',
      data: { text: trimmed },
    });
    setPending(true);
    // If the server never confirms (rate limit, dropped packet), let them try
    // again rather than stranding them on a disabled button for the round.
    setTimeout(() => setPending(false), 2500);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '1rem',
        gap: '0.6rem',
      }}
    >
      <PhaseTimer
        timeRemaining={timeRemaining}
        duration={duration}
        label={`${submittedCount}/${totalPlayers} poslalo`}
      />

      <p
        className="display card"
        style={{
          fontSize: '1.05rem',
          fontWeight: 600,
          lineHeight: 1.3,
          textAlign: 'center',
          padding: '0.75rem 0.9rem',
          borderRadius: '16px',
          margin: 0,
          flexShrink: 0,
          maxHeight: '30vh',
          overflowY: 'auto',
        }}
      >
        {questionText}
      </p>

      <textarea
        id="fibbage-answer"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, FIBBAGE_MAX_ANSWER_LENGTH))}
        placeholder="Napiši lažan odgovor..."
        autoFocus
        rows={2}
        enterKeyHint="send"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        style={{
          width: '100%',
          fontSize: '1.1rem',
          fontWeight: 700,
          padding: '0.85rem 1rem',
          borderRadius: '16px',
          border: '1.5px solid var(--cyan)',
          boxShadow: '0 0 0 4px rgba(111,194,187,.12)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          resize: 'none',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.78rem',
          fontWeight: 700,
          color: 'var(--dim)',
        }}
      >
        <span>Ako pogodiš tačan odgovor — bonus poeni!</span>
        <span>
          {text.length}/{FIBBAGE_MAX_ANSWER_LENGTH}
        </span>
      </div>

      <button
        className="btn-primary"
        onClick={handleSubmit}
        disabled={!text.trim() || pending}
      >
        {pending ? 'Šaljem…' : 'Pošalji ✓'}
      </button>
    </div>
  );
}
