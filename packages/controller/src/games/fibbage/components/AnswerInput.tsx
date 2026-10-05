import { useState } from 'react';
import { socket } from '../../../socket';
import { useHaptics } from '../../../hooks/useHaptics';
import { FIBBAGE_MAX_ANSWER_LENGTH } from '@igra/shared';

interface AnswerInputProps {
  questionText: string;
  /** How many of the expected players are already in. */
  submittedCount: number;
  totalPlayers: number;
}

// Text entry (Kontroler kit 2c). The question is plain text rather than a
// boxed card so more of it fits with the keyboard open, and the send button
// sits in a bar at the bottom of the screen — with the viewport set to
// resize for the keyboard, that bar rides just above it.
export function AnswerInput({
  questionText,
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '1rem 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <p
          className="display"
          style={{ fontSize: '1.32rem', fontWeight: 600, lineHeight: 1.25, margin: 0 }}
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
            minHeight: 74,
            fontSize: '1.2rem',
            fontWeight: 700,
            padding: '14px 16px',
            borderRadius: '18px',
            border: '2px solid var(--accent)',
            boxShadow: '0 0 0 4px rgba(194,155,71,.15)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            caretColor: 'var(--amber)',
            resize: 'none',
            fontFamily: 'inherit',
            outline: 'none',
            flexShrink: 0,
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            fontSize: '0.75rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
          }}
        >
          <span>Pogodiš tačan odgovor? Bonus poeni.</span>
          <span style={{ flexShrink: 0 }}>
            {text.length}/{FIBBAGE_MAX_ANSWER_LENGTH}
          </span>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 0 2px',
          borderTop: '1px solid var(--line)',
        }}
      >
        <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          {submittedCount}/{totalPlayers} poslalo
        </span>
        <button
          className="btn-primary"
          onClick={handleSubmit}
          // Keep focus in the textarea, so tapping send doesn't drop the
          // keyboard (and the bar with it) before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          disabled={!text.trim() || pending}
          style={{ minHeight: 52, padding: '0 26px' }}
        >
          {pending ? 'Šaljem…' : 'Pošalji laž'}
        </button>
      </div>
    </div>
  );
}
