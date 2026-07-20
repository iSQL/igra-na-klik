import { useState } from 'react';
import { socket } from '../../../socket';
import { formatBrojValue } from '@igra/shared';
import type { KvizValueType } from '@igra/shared';

// ---- Matrica (3×3 association) ----------------------------------------------

/**
 * Reusable 3×3 grid. When `onToggle` is given, cells are tappable; `selected`
 * highlights picks. `correct`/`wrong` draw the reveal rings.
 */
export function MatricaGrid({
  cells,
  selected,
  correct,
  wrong,
  onToggle,
  disabled,
}: {
  cells: string[];
  selected?: Set<number>;
  correct?: Set<number>;
  wrong?: Set<number>;
  onToggle?: (i: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.4rem',
        width: '100%',
      }}
    >
      {cells.map((c, i) => {
        const isSel = selected?.has(i);
        const isCorrect = correct?.has(i);
        const isWrong = wrong?.has(i);
        const border = isCorrect
          ? '2.5px solid var(--accent)'
          : isWrong
            ? '2.5px solid var(--danger)'
            : isSel
              ? '2px solid var(--accent)'
              : '1.5px solid var(--line2)';
        const bg = isCorrect
          ? 'rgba(194,155,71,.18)'
          : isSel
            ? 'rgba(194,155,71,.14)'
            : 'var(--bg-secondary)';
        return (
          <button
            key={i}
            type="button"
            onClick={onToggle ? () => onToggle(i) : undefined}
            disabled={disabled || !onToggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              minHeight: '52px',
              padding: '0.3rem',
              background: bg,
              borderRadius: '10px',
              border,
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '0.78rem',
              lineHeight: 1.1,
              cursor: onToggle && !disabled ? 'pointer' : 'default',
            }}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

/** Answering picker: tap exactly 3, then submit. */
export function MatricaPicker({
  cells,
  pick,
  timeRemaining,
}: {
  cells: string[];
  pick: number;
  timeRemaining: number;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else if (next.size < pick) next.add(i);
      return next;
    });
  };

  const submit = () => {
    if (selected.size !== pick) return;
    socket.emit('game:player-action', {
      action: 'quiz:matrix',
      data: { cells: Array.from(selected) },
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        gap: '0.6rem',
        justifyContent: 'center',
      }}
    >
      <MatricaGrid cells={cells} selected={selected} onToggle={toggle} />
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
        Izabrano {selected.size}/{pick} · {Math.ceil(timeRemaining)}s
      </p>
      <button
        onClick={submit}
        disabled={selected.size !== pick}
        className="btn-primary"
        style={{ minHeight: '48px', fontSize: '0.95rem', fontWeight: 800 }}
      >
        Pošalji
      </button>
    </div>
  );
}

// ---- Domino (chronological streak) -----------------------------------------

/** Self-paced Pre/Posle stepper — compare each item to the previous one. */
export function DominoPlayer({
  reference,
  current,
  streak,
  done,
  total,
  lowerLabel,
  higherLabel,
  unit,
  valueType,
  timeRemaining,
}: {
  reference: { label: string; value: number } | null;
  current: { label: string } | null;
  streak: number;
  done: boolean;
  total: number;
  lowerLabel: string;
  higherLabel: string;
  unit?: string;
  valueType?: KvizValueType;
  timeRemaining: number;
}) {
  const answer = (dir: 'before' | 'after') => {
    if (done || !current) return;
    socket.emit('game:player-action', { action: 'quiz:domino', data: { answer: dir } });
  };
  const maxStreak = Math.max(1, total - 1);

  if (done || !current) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '0.6rem',
          textAlign: 'center',
          padding: '1rem',
        }}
      >
        <p style={{ fontSize: '2.6rem', margin: 0 }}>{streak >= maxStreak ? '🏆' : '🔒'}</p>
        <p style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
          {streak}/{maxStreak} tačno
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          {streak >= maxStreak ? 'Sve tačno! Čekamo ostale...' : 'Čekamo ostale...'}
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
        gap: '0.7rem',
        padding: '0.5rem 0',
      }}
    >
      {reference && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            borderRadius: '14px',
            padding: '0.7rem 0.9rem',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
            Referenca
          </p>
          <p style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.1rem 0 0' }}>
            {reference.label}
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)', margin: 0 }}>
            {formatBrojValue(reference.value, unit, valueType)}
          </p>
        </div>
      )}

      <div
        className="card"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.3rem',
          padding: '1rem',
        }}
      >
        <p
          className="display"
          style={{ fontSize: '1.4rem', fontWeight: 800, textAlign: 'center', margin: 0 }}
        >
          {current.label}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          {Math.ceil(timeRemaining)}s
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
        <button
          onClick={() => answer('before')}
          className="btn-primary"
          style={{ flex: 1, minHeight: '64px', fontSize: '1.1rem', fontWeight: 800 }}
        >
          ⬇ {lowerLabel}
        </button>
        <button
          onClick={() => answer('after')}
          className="btn-primary"
          style={{ flex: 1, minHeight: '64px', fontSize: '1.1rem', fontWeight: 800 }}
        >
          ⬆ {higherLabel}
        </button>
      </div>
    </div>
  );
}
