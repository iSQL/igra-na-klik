import { formatBrojValue } from '@igra/shared';
import type { KvizBrojRoundResultEntry, KvizValueType } from '@igra/shared';

/**
 * Results timeline for broj questions: every guess as a colored marker on a
 * min→max bar, with the true value flagged above it.
 */
export function BrojTimeline({
  min,
  max,
  trueValue,
  results,
  unit,
  valueType,
}: {
  min: number;
  max: number;
  trueValue: number;
  results: KvizBrojRoundResultEntry[];
  unit?: string;
  valueType?: KvizValueType;
}) {
  const span = Math.max(1, max - min);
  const pct = (v: number) => ((v - min) / span) * 100;
  return (
    <div style={{ width: '100%', maxWidth: '900px', padding: '2.2rem 1rem 1.6rem' }}>
      <div style={{ position: 'relative', height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
        {/* Guess markers */}
        {results
          .filter((r) => r.guess !== null)
          .map((r) => (
            <div
              key={r.playerId}
              title={`${r.name}: ${r.guess}`}
              style={{
                position: 'absolute',
                left: `${pct(r.guess as number)}%`,
                top: '50%',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: r.avatarColor,
                border: '2px solid var(--bg-primary, #14141f)',
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        {/* True-value marker */}
        <div
          style={{
            position: 'absolute',
            left: `${pct(trueValue)}%`,
            top: '-1.9rem',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent)' }}>
            {formatBrojValue(trueValue, unit, valueType)}
          </span>
          <div style={{ width: '3px', height: '2.6rem', background: 'var(--accent)', borderRadius: '2px' }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <span>{formatBrojValue(min, unit, valueType)}</span>
        <span>{formatBrojValue(max, unit, valueType)}</span>
      </div>
    </div>
  );
}
