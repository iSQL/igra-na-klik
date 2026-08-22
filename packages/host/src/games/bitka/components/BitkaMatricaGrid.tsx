import type { BitkaAnswerResult, BitkaPlayerView } from '@igra/shared';

/**
 * Mreža 3×3 na TV-u — i pitanje i otkrivanje, iz istog crteža.
 *
 * Ista gramatika kao kod izbornog pitanja: tačno je zeleno i čekirano, a
 * avatari sedaju na ćelije koje je taj igrač tapnuo, pa se ceo ishod čita sa
 * jednog mesta. Razlika je što ovde ćelija može biti i tačna i promašena
 * istovremeno — pogođena ćelija dobija oba obeležja.
 *
 * `compact` je varijanta za usku traku ispod mape; arena pitanja (duel i
 * trka za zemlju) dobija punu, preko celog desnog stupca. Rezultat po igraču
 * („2/3") ide kroz `BitkaScoreRow` iz BitkaNewTypes.
 */
export function BitkaMatricaGrid({
  cells,
  correctCells,
  results,
  players,
  revealing,
  compact,
}: {
  cells: string[];
  correctCells?: number[];
  results?: BitkaAnswerResult[];
  players: BitkaPlayerView[];
  revealing: boolean;
  compact?: boolean;
}) {
  const correct = new Set(correctCells ?? []);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: compact ? '0.35rem' : '0.7rem',
        width: '100%',
      }}
    >
      {cells.map((cell, i) => {
        const right = revealing && correct.has(i);
        // Ko je tapnuo baš ovu ćeliju.
        const takers = revealing
          ? (results ?? [])
              .filter((r) => (r.cells ?? []).includes(i))
              .map((r) => players.find((p) => p.playerId === r.playerId))
              .filter((p): p is BitkaPlayerView => !!p)
          : [];
        return (
          <div
            key={i}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              minHeight: compact ? '2.6rem' : '4.4rem',
              padding: compact ? '0.3rem 0.4rem' : '0.6rem 0.7rem',
              borderRadius: '12px',
              background: right ? 'var(--success)' : 'var(--bg-secondary)',
              border: right ? '3px solid #fff' : '3px solid var(--line)',
              opacity: revealing && !right ? 0.4 : 1,
              color: right ? '#fff' : 'var(--text-primary)',
              fontWeight: 800,
              fontSize: compact ? '0.95rem' : '1.35rem',
              lineHeight: 1.15,
              transition: 'opacity 0.25s, background 0.25s',
            }}
          >
            {right && <span style={{ marginRight: '0.35rem' }}>✓</span>}
            <span>{cell}</span>
            {takers.length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  bottom: compact ? '-0.35rem' : '-0.55rem',
                  right: compact ? '-0.2rem' : '-0.3rem',
                  display: 'flex',
                  gap: '0.15rem',
                }}
              >
                {takers.map((p) => (
                  <span
                    key={p.playerId}
                    title={p.name}
                    style={{
                      width: compact ? '1.3rem' : '1.9rem',
                      height: compact ? '1.3rem' : '1.9rem',
                      borderRadius: '50%',
                      background: p.avatarColor,
                      border: '2px solid rgba(0,0,0,0.4)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: compact ? '0.7rem' : '0.95rem',
                    }}
                  >
                    {p.avatarEmoji}
                  </span>
                ))}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
