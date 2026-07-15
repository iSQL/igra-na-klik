import { useState } from 'react';
import { formatBrojValue } from '@igra/shared';
import type { KvizValueType } from '@igra/shared';
import { socket } from '../../../socket';

/**
 * Slider input for broj questions. Emits `quiz:guess { value }` on lock.
 * Mount with `key={questionIndex}` so the local value resets per question.
 */
export function BrojSlider({
  prompt,
  emoji,
  imageUrl,
  min,
  max,
  step,
  unit,
  valueType,
  timeRemaining,
}: {
  prompt: string;
  emoji?: string;
  imageUrl?: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  valueType?: KvizValueType;
  timeRemaining: number;
}) {
  const stepSize = step && step > 0 ? step : 1;
  const snap = (v: number) => {
    const clamped = Math.max(min, Math.min(max, v));
    const snapped = min + Math.round((clamped - min) / stepSize) * stepSize;
    return Math.max(min, Math.min(max, snapped));
  };
  const [value, setValue] = useState(() => snap((min + max) / 2));
  const [sent, setSent] = useState(false);
  const pct =
    max > min ? Math.round(((value - min) / (max - min)) * 100) : 50;

  const lock = () => {
    if (sent) return;
    setSent(true);
    socket.emit('game:player-action', {
      action: 'quiz:guess',
      data: { value },
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '1rem',
        gap: '0.85rem',
        justifyContent: 'center',
      }}
    >
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
        Koliko? · {timeRemaining}s
      </p>
      <p style={{ fontSize: '1.25rem', fontWeight: 800, textAlign: 'center', margin: 0, lineHeight: 1.3 }}>
        {emoji ? `${emoji} ` : ''}
        {prompt}
      </p>

      {imageUrl && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <img
            src={imageUrl}
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: '32vh',
              objectFit: 'contain',
              borderRadius: '0.6rem',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <button
          onClick={() => setValue((v) => snap(v - stepSize))}
          style={stepBtn}
          aria-label="Manje"
        >
          −
        </button>
        <span
          style={{
            fontSize: '2.4rem',
            fontWeight: 800,
            minWidth: '6.5rem',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatBrojValue(value, unit, valueType)}
        </span>
        <button
          onClick={() => setValue((v) => snap(v + stepSize))}
          style={stepBtn}
          aria-label="Više"
        >
          +
        </button>
      </div>

      <input
        type="range"
        className="range-fat"
        min={min}
        max={max}
        step={stepSize}
        value={value}
        onChange={(e) => setValue(snap(parseFloat(e.target.value)))}
        style={{ ['--pct' as string]: `${pct}%` } as React.CSSProperties}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <span>{formatBrojValue(min, unit, valueType)}</span>
        <span>{formatBrojValue(max, unit, valueType)}</span>
      </div>

      <button
        onClick={lock}
        disabled={sent}
        style={{
          padding: '1rem',
          fontSize: '1.2rem',
          fontWeight: 800,
          borderRadius: '12px',
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          opacity: sent ? 0.5 : 1,
        }}
      >
        {sent ? 'Zaključano ✓' : 'Zaključaj odgovor'}
      </button>
    </div>
  );
}

const stepBtn: React.CSSProperties = {
  width: '52px',
  height: '52px',
  borderRadius: '50%',
  border: '2px solid var(--text-secondary)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '1.8rem',
  fontWeight: 800,
  lineHeight: 1,
};
