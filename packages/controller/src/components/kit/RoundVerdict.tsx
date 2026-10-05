import { formatPoints } from '../HostlessLeaderboard';

export type VerdictKind = 'correct' | 'wrong' | 'neutral';

const STYLE: Record<VerdictKind, { bg: string; ink: string; text: string; glow: string; icon: string }> = {
  correct: { bg: 'var(--success)', ink: '#04120b', text: 'var(--success-ink)', glow: 'rgba(87,179,128,.5)', icon: '✓' },
  wrong: { bg: 'var(--danger)', ink: '#fff', text: 'var(--danger)', glow: 'rgba(224,106,94,.45)', icon: '✗' },
  neutral: { bg: 'var(--bg-card)', ink: 'var(--text-primary)', text: 'var(--text-primary)', glow: 'transparent', icon: '•' },
};

/** Soft radial wash behind a result screen, tinted by the verdict. */
export function verdictWash(kind: VerdictKind): string {
  const rgb = kind === 'correct' ? '87,179,128' : kind === 'wrong' ? '224,106,94' : '194,155,71';
  return `radial-gradient(600px 360px at 50% 0%, rgba(${rgb},.2), transparent)`;
}

/**
 * Round result hero (Kontroler kit 2e): verdict and points big enough to read
 * at arm's length, with the running total underneath.
 */
export function RoundVerdict({
  kind,
  title,
  points,
  total,
  icon,
}: {
  kind: VerdictKind;
  title: string;
  points?: number;
  total?: number;
  /** Overrides the ✓ / ✗ glyph (e.g. 👑). */
  icon?: string;
}) {
  const s = STYLE[kind];
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
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: s.bg,
          color: s.ink,
          display: 'grid',
          placeItems: 'center',
          fontSize: '2rem',
          fontWeight: 800,
          boxShadow: `0 0 30px ${s.glow}`,
          animation: 'igra-pop .5s',
        }}
      >
        {icon ?? s.icon}
      </span>
      <span
        className="display"
        style={{ marginTop: 10, fontWeight: 700, fontSize: '2.1rem', lineHeight: 1, color: s.text }}
      >
        {title}
      </span>
      {points !== undefined && (
        <span className="display" style={{ fontWeight: 700, fontSize: '3rem', lineHeight: 1.1 }}>
          +{formatPoints(points)}
        </span>
      )}
      {total !== undefined && (
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          Ukupno {formatPoints(total)} poena
        </span>
      )}
    </div>
  );
}
