import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { useGameStore } from '../store/gameStore';

/**
 * Quiz report/rate controls, embedded in the PlayerMenu popup. Renders only
 * while a kviz question is on screen (answering / showing-results). Emits
 * `quiz:feedback` (report/rating) through the generic player-action channel —
 * same contract as the former standalone corner button, just relocated into
 * the player menu. Local state resets when the question changes.
 */
export function QuizFeedbackMenu() {
  const gameState = useGameStore((s) => s.gameState);
  const gameId = gameState?.gameId;
  const phase = gameState?.phase;
  const questionId =
    gameId === 'quiz' ? (gameState?.data?.questionId as string | undefined) : undefined;
  const active =
    !!questionId && (phase === 'answering' || phase === 'showing-results');

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [reported, setReported] = useState(false);
  const [ratedValue, setRatedValue] = useState(0);

  useEffect(() => {
    setRating(0);
    setHover(0);
    setReported(false);
    setRatedValue(0);
  }, [questionId]);

  if (!active) return null;

  const sendReport = () => {
    if (reported) return;
    setReported(true);
    socket.emit('game:player-action', {
      action: 'quiz:feedback',
      data: { questionId, report: true },
    });
  };

  const sendRating = (value: number) => {
    if (ratedValue) return;
    setRatedValue(value);
    setRating(value);
    socket.emit('game:player-action', {
      action: 'quiz:feedback',
      data: { questionId, rating: value },
    });
  };

  return (
    <>
      <div style={{ height: '1px', background: 'var(--line2)', margin: '0.15rem 0' }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          padding: '0.6rem 0.7rem',
          borderRadius: '12px',
          background: 'var(--bg-card)',
          border: '1px solid var(--line2)',
        }}
      >
        <span
          style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-secondary)',
          }}
        >
          Oceni pitanje
        </span>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.2rem' }}>
          {[1, 2, 3, 4, 5].map((n) => {
            const on = (hover || rating) >= n;
            return (
              <button
                key={n}
                disabled={ratedValue > 0}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => sendRating(n)}
                aria-label={`${n} od 5`}
                style={{
                  flex: 1,
                  fontSize: '1.5rem',
                  lineHeight: 1,
                  padding: '0.15rem 0',
                  background: 'transparent',
                  border: 'none',
                  cursor: ratedValue > 0 ? 'default' : 'pointer',
                  filter: on ? 'none' : 'grayscale(1) opacity(0.4)',
                  transition: 'filter .1s',
                }}
              >
                ⭐
              </button>
            );
          })}
        </div>
        {ratedValue > 0 && (
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--success)', fontWeight: 700 }}>
            Ocena poslata: {ratedValue}/5
          </p>
        )}
        <button
          onClick={sendReport}
          disabled={reported}
          style={{
            width: '100%',
            padding: '0.55rem',
            fontSize: '0.85rem',
            fontWeight: 700,
            borderRadius: '10px',
            border: '1px solid var(--danger)',
            background: reported
              ? 'transparent'
              : 'color-mix(in srgb, var(--danger) 12%, transparent)',
            color: 'var(--danger)',
            cursor: reported ? 'default' : 'pointer',
          }}
        >
          {reported ? '✓ Prijavljeno kao netačno' : '⚠ Prijavi pitanje kao netačno'}
        </button>
      </div>
    </>
  );
}
