import type {
  BitkaAnswerResult,
  BitkaHostData,
  BitkaPlayerView,
  BitkaQuestionView,
} from '@igra/shared';
import { formatBrojValue } from '@igra/shared';

/**
 * TV prikaz za tipove pitanja koji nisu ni izbor ni broj — redosled, domino i
 * slobodan tekst. Svaka komponenta nosi i fazu odgovaranja i otkrivanje, jer
 * su to na ovom ekranu dva stanja istog crteža, a ne dva ekrana.
 *
 * `compact` je varijanta za usku traku pored mape (trka za zemlju); duel
 * dobija punu, preko celog desnog stupca.
 */

function Avatar({ player, size }: { player: BitkaPlayerView; size: string }) {
  return (
    <span
      title={player.name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: player.avatarColor,
        border: '2px solid rgba(0,0,0,0.35)',
        display: 'grid',
        placeItems: 'center',
        fontSize: `calc(${size} * 0.55)`,
        flexShrink: 0,
      }}
    >
      {player.avatarEmoji}
    </span>
  );
}

/** „Pera 3/5" — rezultat po igraču, isti red koji matrica već koristi. */
export function BitkaScoreRow({
  results,
  players,
  max,
  compact,
}: {
  results: BitkaAnswerResult[];
  players: BitkaPlayerView[];
  max: number;
  compact?: boolean;
}) {
  const rows = [...results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? '0.35rem' : '0.6rem' }}>
      {rows.map((r) => {
        const p = players.find((x) => x.playerId === r.playerId);
        if (!p) return null;
        const score = r.score ?? 0;
        return (
          <span
            key={r.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: compact ? '0.15rem 0.45rem' : '0.3rem 0.7rem',
              borderRadius: '999px',
              background: 'var(--bg-secondary)',
              border: `2px solid ${score > 0 ? 'var(--accent)' : 'var(--line)'}`,
              fontWeight: 800,
              fontSize: compact ? '0.75rem' : '1rem',
              color: 'var(--text-primary)',
            }}
          >
            <Avatar player={p} size={compact ? '1.2rem' : '1.6rem'} />
            <span>{p.name}</span>
            <span style={{ color: score > 0 ? 'var(--accent)' : 'var(--dim)' }}>
              {score}/{max}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Redosled. Dok se odgovara stoje izmešani pojmovi (isti kod svih, pa
 * posmatrač duela ima o čemu da razmišlja); u otkrivanju se lista prepisuje u
 * TAČAN redosled, a uz svaku stavku sedaju avatari onih koji su je stavili
 * baš na to mesto — ista gramatika kao avatari na opciji izbornog pitanja.
 */
export function BitkaRedosledList({
  question,
  host,
  results,
  revealing,
  compact,
}: {
  question: BitkaQuestionView;
  host: BitkaHostData;
  results: BitkaAnswerResult[];
  revealing: boolean;
  compact?: boolean;
}) {
  const items = question.items ?? [];
  const correctOrder = host.correctOrder;
  // U otkrivanju se ide po tačnom poretku: `correctOrder[pos]` je indeks
  // prikazane stavke koja pripada mestu `pos`.
  const rows =
    revealing && correctOrder
      ? correctOrder.map((shownIdx, pos) => ({ shownIdx, pos }))
      : items.map((_, shownIdx) => ({ shownIdx, pos: -1 }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.25rem' : '0.45rem' }}>
      {rows.map(({ shownIdx, pos }) => {
        const takers =
          revealing && pos >= 0
            ? results
                .filter((r) => (r.order ?? [])[pos] === shownIdx)
                .map((r) => host.players.find((p) => p.playerId === r.playerId))
                .filter((p): p is BitkaPlayerView => !!p)
            : [];
        return (
          <div
            key={shownIdx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: compact ? '0.25rem 0.5rem' : '0.5rem 0.8rem',
              borderRadius: '10px',
              background: 'var(--bg-secondary)',
              border: revealing ? '2px solid var(--success)' : '2px solid var(--line)',
              fontWeight: 700,
              fontSize: compact ? '0.8rem' : '1.15rem',
              color: 'var(--text-primary)',
            }}
          >
            {revealing && (
              <span
                style={{
                  minWidth: compact ? '1.1rem' : '1.6rem',
                  fontWeight: 900,
                  color: 'var(--accent)',
                }}
              >
                {pos + 1}.
              </span>
            )}
            <span style={{ flex: 1 }}>{items[shownIdx]}</span>
            {takers.map((p) => (
              <Avatar key={p.playerId} player={p} size={compact ? '1.2rem' : '1.7rem'} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Domino. Odgovori ne stižu odjednom nego korak po korak, pa dok se igra TV
 * prikazuje trku: traka po igraču, dokle je stigao. Tek u otkrivanju se
 * pokazuje ceo niz sa vrednostima — dotle ga nema ni u broadcastu.
 */
export function BitkaDominoBoard({
  question,
  host,
  results,
  revealing,
  compact,
}: {
  question: BitkaQuestionView;
  host: BitkaHostData;
  results: BitkaAnswerResult[];
  revealing: boolean;
  compact?: boolean;
}) {
  const steps = question.steps ?? 1;

  if (revealing) {
    const chain = host.dominoChain ?? [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.3rem' : '0.6rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? '0.25rem' : '0.4rem' }}>
          {chain.map((it, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: compact ? '0.2rem 0.4rem' : '0.4rem 0.7rem',
                borderRadius: '10px',
                background: 'var(--bg-secondary)',
                border: '2px solid var(--line)',
                fontSize: compact ? '0.7rem' : '0.95rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              <span>{it.label}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 900 }}>
                {formatBrojValue(it.value, question.unit, question.valueType)}
              </span>
            </span>
          ))}
        </div>
        <BitkaScoreRow results={results} players={host.players} max={steps} compact={compact} />
      </div>
    );
  }

  const progress = host.dominoProgress ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.25rem' : '0.5rem' }}>
      {progress.map((pr) => {
        const p = host.players.find((x) => x.playerId === pr.playerId);
        if (!p) return null;
        const pct = Math.round((Math.min(pr.streak, steps) / steps) * 100);
        return (
          <div key={pr.playerId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Avatar player={p} size={compact ? '1.3rem' : '2rem'} />
            <div
              style={{
                flex: 1,
                height: compact ? '0.6rem' : '0.9rem',
                borderRadius: '999px',
                background: 'var(--bg-secondary)',
                border: '2px solid var(--line)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: pr.done ? 'var(--dim)' : 'var(--accent)',
                  transition: 'width 0.3s',
                }}
              />
            </div>
            <span
              style={{
                fontWeight: 800,
                fontSize: compact ? '0.75rem' : '1rem',
                color: pr.done ? 'var(--dim)' : 'var(--accent)',
                minWidth: compact ? '2.4rem' : '3.2rem',
                textAlign: 'right',
              }}
            >
              {pr.streak}/{steps}
              {pr.done ? ' 🔒' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Emoji / citat / anagram. Zagonetka je krupna jer je ona celo pitanje; u
 * otkrivanju ide tačan odgovor i šta je ko otkucao — kod slobodnog teksta
 * „tačno/netačno" ne kaže ništa o tome šta je ko probao.
 */
export function BitkaTextPanel({
  question,
  host,
  results,
  revealing,
  compact,
}: {
  question: BitkaQuestionView;
  host: BitkaHostData;
  results: BitkaAnswerResult[];
  revealing: boolean;
  compact?: boolean;
}) {
  const riddle =
    question.textKind === 'emoji'
      ? question.emojis
      : question.textKind === 'anagram'
        ? question.scramble
        : question.quote;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.3rem' : '0.7rem' }}>
      {riddle && (
        <div
          style={{
            fontSize:
              question.textKind === 'emoji'
                ? compact
                  ? '1.8rem'
                  : '4rem'
                : compact
                  ? '0.95rem'
                  : '2rem',
            fontWeight: 800,
            letterSpacing: question.textKind === 'anagram' ? '0.3em' : undefined,
            textAlign: 'center',
            color: 'var(--text-primary)',
            lineHeight: 1.25,
          }}
        >
          {riddle}
          {question.textKind === 'dopuna' && ' …'}
        </div>
      )}
      {question.category && !revealing && (
        <div
          style={{
            textAlign: 'center',
            fontSize: compact ? '0.7rem' : '1rem',
            color: 'var(--text-secondary)',
            fontWeight: 700,
          }}
        >
          {question.category}
        </div>
      )}
      {revealing && host.correctText && (
        <div
          style={{
            textAlign: 'center',
            fontSize: compact ? '0.9rem' : '1.8rem',
            fontWeight: 900,
            color: 'var(--accent)',
          }}
        >
          {host.correctText}
        </div>
      )}
      {revealing && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? '0.25rem' : '0.5rem' }}>
          {results.map((r) => {
            const p = host.players.find((x) => x.playerId === r.playerId);
            if (!p) return null;
            return (
              <span
                key={r.playerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: compact ? '0.15rem 0.45rem' : '0.3rem 0.7rem',
                  borderRadius: '999px',
                  background: 'var(--bg-secondary)',
                  border: `2px solid ${r.correct ? 'var(--success)' : 'var(--line)'}`,
                  fontWeight: 700,
                  fontSize: compact ? '0.72rem' : '0.95rem',
                  color: 'var(--text-primary)',
                }}
              >
                <Avatar player={p} size={compact ? '1.2rem' : '1.5rem'} />
                <span style={{ color: r.correct ? 'var(--success)' : 'var(--dim)' }}>
                  {r.correct ? (r.text ?? '✓') : 'nije pogodio'}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
