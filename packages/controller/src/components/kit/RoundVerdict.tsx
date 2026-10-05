import { useEffect, useState } from 'react';
import { formatPoints } from '../HostlessLeaderboard';
import { cue } from '../../utils/cues';

export type VerdictKind = 'correct' | 'wrong' | 'neutral';

const STYLE: Record<VerdictKind, { bg: string; ink: string; text: string; glow: string; icon: string }> = {
  correct: { bg: 'var(--success)', ink: '#04120b', text: 'var(--success-ink)', glow: 'rgba(87,179,128,.5)', icon: '✓' },
  wrong: { bg: 'var(--danger)', ink: '#fff', text: 'var(--danger)', glow: 'rgba(224,106,94,.45)', icon: '✕' },
  neutral: { bg: 'var(--bg-card)', ink: 'var(--text-primary)', text: 'var(--text-primary)', glow: 'transparent', icon: '•' },
};

/** Soft radial wash behind a result screen, tinted by the verdict. */
export function verdictWash(kind: VerdictKind): string {
  const rgb = kind === 'correct' ? '87,179,128' : kind === 'wrong' ? '224,106,94' : '194,155,71';
  return `radial-gradient(600px 360px at 50% 0%, rgba(${rgb},.2), transparent)`;
}

/** Counts 0 → target in `ms` (4e: points count up in 600 ms). */
function useCountUp(target: number, ms = 600): number {
  const [n, setN] = useState(target > 0 ? 0 : target);
  useEffect(() => {
    if (target <= 0) {
      setN(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setN(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

/** Where the player stands after the round (bottom card of 4e/4f). */
export interface VerdictStanding {
  rank: number;
  total: number;
  /** Places gained (+) or lost (−) this round; the line shows only on a change. */
  moved?: number;
  /** Points to the next place up, when not first. */
  gapUp?: number;
  /** Correct answers in a row — the chip shows from 3. */
  streak?: number;
}

/**
 * Round result hero (Kontroler kit 2e, redizajn 4e/4f): verdict and points big
 * enough to read at arm's length. The check pops in, a miss shakes once, the
 * points count up, and the matching cue fires (vibration / optional sound).
 */
export function RoundVerdict({
  kind,
  title,
  points,
  total,
  icon,
  detail,
  standing,
}: {
  kind: VerdictKind;
  title: string;
  points?: number;
  total?: number;
  /** Overrides the ✓ / ✕ glyph (e.g. 👑, ⏱). */
  icon?: string;
  /** One line under the points, e.g. "Odgovorio si za 2,4 s". */
  detail?: string;
  standing?: VerdictStanding;
}) {
  const s = STYLE[kind];
  const shown = useCountUp(points ?? 0);

  useEffect(() => {
    if (kind === 'correct') cue('correct');
    else if (kind === 'wrong') cue('wrong');
  }, [kind]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        textAlign: 'center',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: s.bg,
          color: s.ink,
          display: 'grid',
          placeItems: 'center',
          fontSize: '2.2rem',
          fontWeight: 800,
          boxShadow: `0 0 0 10px ${s.glow === 'transparent' ? 'transparent' : 'rgba(250,246,240,.06)'}, 0 0 30px ${s.glow}`,
          animation:
            kind === 'wrong'
              ? 'igra-pop .3s cubic-bezier(.34,1.56,.64,1), igra-nope .3s .3s'
              : 'igra-pop .3s cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        {icon ?? s.icon}
      </span>
      <span
        className="display"
        style={{ marginTop: 12, fontWeight: 700, fontSize: '2.1rem', lineHeight: 1, color: s.text }}
      >
        {title}
      </span>
      {points !== undefined && (
        <span
          className="display"
          style={{
            fontWeight: 800,
            fontSize: '3rem',
            lineHeight: 1.1,
            fontVariantNumeric: 'tabular-nums',
            color: points > 0 ? 'var(--amber)' : undefined,
          }}
        >
          +{formatPoints(shown)}
        </span>
      )}
      {detail && (
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          {detail}
        </span>
      )}
      {total !== undefined && !standing && (
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          Ukupno {formatPoints(total)} poena
        </span>
      )}
      {standing && <StandingCard standing={standing} />}
    </div>
  );
}

function StandingCard({ standing }: { standing: VerdictStanding }) {
  const { rank, total, moved, gapUp, streak } = standing;
  const line =
    moved && moved > 0
      ? `Popeo/la si se za ${moved} ${moved === 1 ? 'mesto' : 'mesta'}`
      : moved && moved < 0
        ? `Pao/la si za ${-moved} ${moved === -1 ? 'mesto' : 'mesta'}`
        : gapUp && rank > 1
          ? `${formatPoints(gapUp)} do ${rank - 1}. mesta`
          : null;
  return (
    <div
      style={{
        marginTop: 14,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 18,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--line)',
        textAlign: 'left',
      }}
    >
      <span className="display" style={{ fontWeight: 800, fontSize: '1.75rem', lineHeight: 1 }}>
        {rank}.
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>mesto · {formatPoints(total)}</span>
        {line && (
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            {line}
          </span>
        )}
      </span>
      {streak !== undefined && streak >= 3 && (
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 800,
            padding: '6px 10px',
            borderRadius: 999,
            background: 'rgba(227,180,94,.16)',
            color: 'var(--amber)',
            flexShrink: 0,
            animation: 'igra-pop .3s',
          }}
        >
          🔥 {streak} zaredom
        </span>
      )}
    </div>
  );
}
