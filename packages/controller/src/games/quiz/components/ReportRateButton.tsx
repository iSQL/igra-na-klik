import { useState, useEffect } from 'react';
import { socket } from '../../../socket';

/**
 * Subtle corner control on every kviz question: tap to report the question as
 * wrong or rate it 1–5. Emits `quiz:feedback` (report/rating) through the
 * generic player-action channel; the server persists it for the admin editor.
 * Deliberately unobtrusive so it never competes with the answer UI. Resets when
 * the question changes (keyed by questionId).
 */
export function ReportRateButton({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [reported, setReported] = useState(false);
  const [ratedValue, setRatedValue] = useState(0);

  // New question → forget the previous one's local state.
  useEffect(() => {
    setOpen(false);
    setRating(0);
    setHover(0);
    setReported(false);
    setRatedValue(0);
  }, [questionId]);

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

  const done = reported || ratedValue > 0;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Prijavi ili oceni pitanje"
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
          right: 'calc(env(safe-area-inset-right, 0px) + 10px)',
          zIndex: 40,
          padding: 0,
          fontSize: '0.72rem',
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: '0.02em',
          color: done ? 'var(--success)' : 'var(--text-secondary)',
          background: 'none',
          border: 'none',
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
          opacity: open ? 1 : 0.7,
          cursor: 'pointer',
        }}
      >
        {done ? 'Hvala' : 'Prijavi / oceni'}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 41,
              background: 'rgba(0,0,0,0.28)',
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: 'calc(env(safe-area-inset-top, 0px) + 44px)',
              right: 'calc(env(safe-area-inset-right, 0px) + 8px)',
              zIndex: 42,
              width: 'min(88vw, 260px)',
              padding: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              background: 'var(--bg-card)',
              border: '1px solid var(--line2)',
              borderRadius: '14px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              animation: 'igra-pop .2s',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '0.72rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-secondary)',
              }}
            >
              Oceni pitanje
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.2rem' }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = (hover || rating) >= n;
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
                      filter: active ? 'none' : 'grayscale(1) opacity(0.4)',
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

            <div style={{ height: 1, background: 'var(--line2)' }} />

            <button
              onClick={sendReport}
              disabled={reported}
              style={{
                width: '100%',
                padding: '0.55rem',
                fontSize: '0.82rem',
                fontWeight: 700,
                borderRadius: '10px',
                border: '1px solid var(--danger)',
                background: reported ? 'transparent' : 'color-mix(in srgb, var(--danger) 12%, transparent)',
                color: 'var(--danger)',
                cursor: reported ? 'default' : 'pointer',
              }}
            >
              {reported ? '✓ Prijavljeno kao netačno' : '⚠ Prijavi kao netačno'}
            </button>

            <button
              onClick={() => setOpen(false)}
              style={{
                width: '100%',
                padding: '0.4rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: '10px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Zatvori
            </button>
          </div>
        </>
      )}
    </>
  );
}
