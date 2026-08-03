import type { BitkaHostData, BitkaPlayerView } from '@igra/shared';

/**
 * Broj-pitanje koje je razrešilo nerešen duel.
 *
 * Kad su oba duelanta odgovorila isto (oba tačno ili oba netačno), zemlju
 * deli broj — a on je ranije nestajao sa ekrana bez otkrivanja, pa je ispadalo
 * da se teritorija sama promenila. Renderuje se svuda gde stoji i otkrivanje
 * izbornog pitanja: na ekranu duelanta i u hostless traci.
 */
export function BitkaTiebreak({
  host,
  myPlayerId,
  compact,
  centered,
}: {
  host: BitkaHostData;
  myPlayerId: string;
  compact?: boolean;
  /** Preko mape lebdi centrirano; u kartici hostless trake stoji levo. */
  centered?: boolean;
}) {
  const tb = host.tiebreak;
  if (!tb) return null;

  const unit = tb.question.unit ? ` ${tb.question.unit}` : '';
  const rows = tb.results
    .map((r) => ({ r, p: host.players.find((x) => x.playerId === r.playerId) }))
    .filter((row): row is { r: (typeof tb.results)[number]; p: BitkaPlayerView } => !!row.p)
    .sort((a, b) => {
      const da = a.r.value == null ? Infinity : Math.abs(a.r.value - tb.correctValue);
      const db = b.r.value == null ? Infinity : Math.abs(b.r.value - tb.correctValue);
      return da - db;
    });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        padding: compact ? '0.3rem 0' : '0.5rem 0.6rem',
        borderTop: centered ? 'none' : '1px solid var(--line)',
        fontSize: compact ? '0.72rem' : '0.85rem',
        textAlign: centered ? 'center' : 'left',
        alignItems: centered ? 'center' : 'stretch',
      }}
    >
      <div style={{ color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--accent)' }}>Nerešeno — odlučio je broj:</strong>{' '}
        {tb.question.text}
      </div>
      <div style={{ fontWeight: 800, color: 'var(--accent)' }}>
        Tačno: {tb.correctValue}
        {unit}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.25rem',
          justifyContent: centered ? 'center' : 'flex-start',
        }}
      >
        {rows.map(({ r, p }, i) => {
          const best = i === 0 && r.value != null;
          return (
            <span
              key={p.playerId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.12rem 0.45rem',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.07)',
                border: `1px solid ${best ? 'var(--success)' : 'var(--line2)'}`,
                opacity: r.value == null ? 0.5 : 1,
                fontWeight: 700,
              }}
            >
              <span>{p.avatarEmoji}</span>
              <span>{p.playerId === myPlayerId ? 'ti' : p.name}</span>
              <span style={{ color: best ? 'var(--success)' : 'var(--text-secondary)' }}>
                {r.value == null ? 'nije stigao' : `${r.value}${unit}`}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
