import type { KvizLinkRecap as Recap } from '@igra/shared';

/**
 * "Tvoji odgovori" (Kviz link · 1c): after a link game the phone lists its own
 * answers — only its own, they arrive in the private playerData slice.
 */
export function KvizLinkRecap({ recap, onDone }: { recap: Recap; onDone: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '400px',
        alignSelf: 'stretch',
        minHeight: 0,
        padding: '0.9rem 0.2rem 0.5rem',
        gap: '0.9rem',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--amber)',
          }}
        >
          Kraj partije · {recap.rank}. mesto
        </span>
        <span className="display" style={{ fontWeight: 700, fontSize: '1.7rem', lineHeight: 1.05 }}>
          Tvoji odgovori
        </span>
        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {recap.correct} od {recap.total} tačno · {recap.points.toLocaleString('sr-RS')} poena
        </span>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
        }}
      >
        {recap.items.map((it, i) => {
          const mark = it.ok === null ? '—' : it.ok ? '✓' : '✕';
          const tone =
            it.ok === null
              ? { bg: 'rgba(245,235,224,.08)', ink: 'var(--dim)' }
              : it.ok
                ? { bg: 'rgba(87,179,128,.18)', ink: 'var(--success-ink)' }
                : { bg: 'rgba(224,106,94,.18)', ink: 'var(--danger)' };
          const answer =
            (it.a === null ? 'bez odgovora' : `Ti: ${it.a}`) +
            (!it.ok && it.right ? ` · tačno: ${it.right}` : '');
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.55rem 0.7rem',
                borderRadius: 14,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--line)',
              }}
            >
              <span
                aria-label={it.ok === null ? 'bez odgovora' : it.ok ? 'tačno' : 'netačno'}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  flex: 'none',
                  background: tone.bg,
                  color: tone.ink,
                }}
              >
                {mark}
              </span>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={ellipsis({ fontSize: '0.84rem', fontWeight: 700 })}>{it.q}</span>
                <span
                  style={ellipsis({
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                  })}
                >
                  {answer}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <button className="btn-primary" onClick={onDone}>
        Nova partija →
      </button>
    </div>
  );
}

function ellipsis(style: React.CSSProperties): React.CSSProperties {
  return { ...style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
}
