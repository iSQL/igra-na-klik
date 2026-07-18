import { useState } from 'react';
import { socket } from '../../../socket';
import { useHaptics } from '../../../hooks/useHaptics';

/**
 * Tap-to-order input for redosled questions: tapping a term appends it to
 * your sequence (numbered badge); tapping a picked term removes it (later
 * picks shift up). "Potvrdi" locks the arrangement — one submission.
 */
export function RedosledPicker({
  items,
  timeRemaining,
}: {
  items: string[];
  timeRemaining: number;
}) {
  const haptics = useHaptics();
  // picked[k] = index into items of the k-th term in the player's order.
  const [picked, setPicked] = useState<number[]>([]);

  const toggle = (idx: number) => {
    haptics.tap();
    setPicked((prev) =>
      prev.includes(idx) ? prev.filter((v) => v !== idx) : [...prev, idx]
    );
  };

  const submit = () => {
    if (picked.length !== items.length) return;
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'quiz:order',
      data: { order: picked },
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        width: '100%',
        height: '100%',
        minHeight: 0,
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
        }}
      >
        {items.map((it, idx) => {
          const pos = picked.indexOf(idx);
          const on = pos >= 0;
          return (
            <button
              key={idx}
              onClick={() => toggle(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.7rem 0.8rem',
                borderRadius: '12px',
                border: `2px solid ${on ? 'var(--accent)' : 'var(--line2)'}`,
                background: on ? 'rgba(194,155,71,0.18)' : 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '0.95rem',
                fontWeight: 700,
                textAlign: 'left',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span
                style={{
                  width: '1.7rem',
                  height: '1.7rem',
                  borderRadius: '50%',
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  background: on ? 'var(--accent)' : 'var(--bg-card)',
                  color: on ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {on ? pos + 1 : '·'}
              </span>
              <span style={{ flex: 1 }}>{it}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={submit}
        disabled={picked.length !== items.length}
        className="btn-primary"
        style={{
          minHeight: '52px',
          fontSize: '1.05rem',
          fontWeight: 800,
          opacity: picked.length === items.length ? 1 : 0.5,
        }}
      >
        {picked.length === items.length
          ? 'Potvrdi redosled ✓'
          : `Izabrano ${picked.length}/${items.length}`}
      </button>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
        {Math.ceil(timeRemaining)}s · tapni redom, od prvog ka poslednjem
      </p>
    </div>
  );
}
