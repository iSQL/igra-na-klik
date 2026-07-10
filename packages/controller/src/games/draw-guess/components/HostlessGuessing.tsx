import { useEffect, useRef, useState } from 'react';
import { socket } from '../../../socket';
import { useT } from '../../../i18n/useT';
import type { DrawGuessGuess, DrawOp } from '@igra/shared';
import { SpectatorCanvas } from './SpectatorCanvas';

interface HostlessGuessingProps {
  operations: DrawOp[];
  guesses: DrawGuessGuess[];
  hint: string;
  timeRemaining: number;
  hasGuessedCorrectly: boolean;
}

/**
 * Hostless drawing-phase view for a guesser: there is no TV, so we show a
 * half-width read-only copy of the drawing with the live feed of everyone's
 * attempts beside it, plus the hint + guess input.
 *
 * Canvas and feed are two 50%-wide cells that share the same 4:3 aspect ratio,
 * so they always end up the same height without any measuring. Keeping the
 * canvas at half width also keeps the whole screen short enough that the guess
 * input stays visible when the mobile keyboard opens (the old full-width canvas
 * pushed the input below the fold, so the browser scrolled the canvas away).
 */
export function HostlessGuessing({
  operations,
  guesses,
  hint,
  timeRemaining,
  hasGuessedCorrectly,
}: HostlessGuessingProps) {
  const t = useT();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '0.6rem',
        gap: '0.5rem',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexShrink: 0 }}>
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <SpectatorCanvas operations={operations} />
        </div>
        <GuessFeed guesses={guesses} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexShrink: 0 }}>
        <span
          className="display"
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            letterSpacing: '0.2rem',
            color: 'var(--lime)',
          }}
        >
          {hint}
        </span>
        <span
          className="display"
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: timeRemaining <= 10 ? 'var(--danger)' : 'var(--amber)',
          }}
        >
          {timeRemaining}
        </span>
      </div>

      {hasGuessedCorrectly ? (
        <div
          style={{
            flexShrink: 0,
            textAlign: 'center',
            padding: '0.6rem',
            background: 'rgba(47,224,138,.12)',
            border: '1px solid var(--success)',
            borderRadius: '14px',
            color: 'var(--success)',
            fontWeight: 800,
          }}
        >
          ✓ {t('drawGuess.correct')}
        </div>
      ) : (
        <GuessForm />
      )}
    </div>
  );
}

function GuessForm() {
  const t = useT();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit('game:player-action', {
      action: 'draw:guess',
      data: { text: text.trim() },
    });
    setText('');
    inputRef.current?.focus();
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', gap: '0.5rem', width: '100%', flexShrink: 0 }}
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
          minWidth: 0,
          padding: '0.7rem 1rem',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1.5px solid var(--cyan)',
          boxShadow: '0 0 0 4px rgba(111,194,187,.12)',
          borderRadius: '14px',
          fontSize: '1rem',
          fontWeight: 700,
        }}
      />
      <button
        type="submit"
        disabled={!text.trim()}
        style={{
          padding: '0.7rem 1.25rem',
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
  );
}

function GuessFeed({ guesses }: { guesses: DrawGuessGuess[] }) {
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
        // Same width (50% via flex) and aspect ratio as the canvas next to it,
        // so both cells render at exactly the same height. Content scrolls.
        flex: '1 1 0',
        minWidth: 0,
        aspectRatio: '4 / 3',
        overflowY: 'auto',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '0.5rem 0.6rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
      }}
    >
      <p
        style={{
          fontSize: '0.7rem',
          color: 'var(--text-secondary)',
          fontWeight: 700,
          margin: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {t('drawGuess.attempts')}
      </p>
      {guesses.length === 0 && (
        <p style={{ fontSize: '0.8rem', color: 'var(--dim)', fontStyle: 'italic', margin: 0 }}>
          {t('drawGuess.noAttempts')}
        </p>
      )}
      {guesses.map((g, i) => (
        <div
          key={i}
          style={{
            fontSize: '0.85rem',
            lineHeight: 1.3,
            color: g.correct ? 'var(--success)' : 'var(--text-primary)',
            fontWeight: g.correct ? 700 : 400,
            wordBreak: 'break-word',
          }}
        >
          <span style={{ fontWeight: 700 }}>{g.playerName}:</span>{' '}
          {/* Never leak the word — a correct guess shows a badge, not its text. */}
          {g.correct ? t('drawGuess.guessedIt') : g.text}
        </div>
      ))}
    </div>
  );
}
