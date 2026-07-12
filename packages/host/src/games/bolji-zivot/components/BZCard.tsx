import type { CSSProperties } from 'react';
import { bzEmojiFor } from '@igra/shared';

interface FaceProps {
  v: number;
  name: string;
  size?: number; // width in px; height = size * 1.4
  paired?: boolean;
  style?: CSSProperties;
}

/** Lice karte: vrednost + emoji + ime lika, brand navy/gold. */
export function BZCardFace({ v, name, size = 72, paired, style }: FaceProps) {
  const h = size * 1.4;
  return (
    <div
      style={{
        width: size,
        height: h,
        borderRadius: size * 0.12,
        background: 'var(--bg-card)',
        border: `2px solid ${paired ? 'var(--success)' : 'var(--accent)'}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: size * 0.08,
        boxSizing: 'border-box',
        position: 'relative',
        ...style,
      }}
    >
      <span
        className="display"
        style={{
          fontSize: size * 0.34,
          fontWeight: 700,
          lineHeight: 1,
          color: paired ? 'var(--success)' : 'var(--accent)',
          textDecoration: paired ? 'line-through' : undefined,
        }}
      >
        {v}
      </span>
      <span style={{ fontSize: size * 0.36, lineHeight: 1 }}>
        {bzEmojiFor(v, name)}
      </span>
      <span
        style={{
          fontSize: Math.max(9, size * 0.13),
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: 1.05,
          color: 'var(--text-primary)',
        }}
      >
        {name}
      </span>
    </div>
  );
}

interface BackProps {
  pos: number;
  size?: number;
  highlight?: boolean;
  dimmed?: boolean;
  style?: CSSProperties;
}

/** Poleđina karte sa brojem pozicije (poziciono pamćenje je igra). */
export function BZCardBack({ pos, size = 72, highlight, dimmed, style }: BackProps) {
  const h = size * 1.4;
  return (
    <div
      style={{
        width: size,
        height: h,
        borderRadius: size * 0.12,
        background:
          'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%)',
        border: `2px solid ${highlight ? 'var(--warning, #E9C46A)' : 'rgba(194,155,71,0.45)'}`,
        boxShadow: highlight ? '0 0 12px rgba(233,196,106,0.7)' : undefined,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: size * 0.06,
        opacity: dimmed ? 0.45 : 1,
        position: 'relative',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <span style={{ fontSize: size * 0.4, lineHeight: 1 }}>🧿</span>
      <span
        style={{
          fontSize: size * 0.2,
          fontWeight: 700,
          color: 'var(--text-secondary)',
        }}
      >
        {pos + 1}
      </span>
    </div>
  );
}

/** Prazno mesto (karta odbačena slapom). */
export function BZCardGap({ size = 72, style }: { size?: number; style?: CSSProperties }) {
  const h = size * 1.4;
  return (
    <div
      style={{
        width: size,
        height: h,
        borderRadius: size * 0.12,
        border: '2px dashed rgba(255,255,255,0.15)',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}
