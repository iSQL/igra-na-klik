import { useState, type ReactNode } from 'react';
import type { BitkaAnswerResult, BitkaHostData, BitkaQuestionView } from '@igra/shared';
import type { BitkaPlayerView } from '@igra/shared';
import { useHaptics } from '../../../hooks/useHaptics';

/**
 * Mreža 3×3 na telefonu — jedan crtež za sva četiri mesta na kojima se
 * matrica pojavljuje: dok se odgovara, u otkrivanju, kod posmatrača duela i na
 * hostless traci. Ista pravila kao kod izbornog pitanja: tačno je zeleno i
 * čekirano, ostalo bledi, a avatari sedaju na ćelije koje je taj igrač tapnuo.
 *
 * `onToggle` je jedino što razdvaja aktivan unos od gledanja — bez njega su
 * ćelije obična polja, pa ista komponenta služi i posmatraču.
 */
export function BitkaMatricaCells({
  cells,
  selected,
  correctCells,
  results,
  players,
  myPlayerId,
  revealing,
  onToggle,
  disabled,
  compact,
}: {
  cells: string[];
  selected?: Set<number>;
  correctCells?: number[];
  results?: BitkaAnswerResult[];
  players?: BitkaPlayerView[];
  myPlayerId?: string;
  revealing?: boolean;
  onToggle?: (i: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const correct = new Set(correctCells ?? []);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: compact ? '0.3rem' : '0.5rem',
        width: '100%',
      }}
    >
      {cells.map((cell, i) => {
        const isRight = !!revealing && correct.has(i);
        const isPicked = selected?.has(i);
        const takers = revealing
          ? (results ?? [])
              .filter((r) => (r.cells ?? []).includes(i))
              .map((r) => (players ?? []).find((p) => p.playerId === r.playerId))
              .filter((p): p is BitkaPlayerView => !!p)
          : [];
        return (
          <button
            key={i}
            type="button"
            disabled={disabled || !onToggle}
            onClick={onToggle ? () => onToggle(i) : undefined}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              minHeight: compact ? '2.6rem' : '4.2rem',
              padding: compact ? '0.25rem' : '0.4rem',
              borderRadius: '12px',
              background: isRight ? 'var(--success)' : 'var(--bg-secondary)',
              border: isRight
                ? '3px solid #fff'
                : isPicked
                  ? '3px solid var(--accent)'
                  : '2px solid var(--line2)',
              color: isRight ? '#fff' : 'var(--text-primary)',
              fontWeight: 800,
              fontSize: compact ? '0.7rem' : '0.85rem',
              lineHeight: 1.15,
              // U otkrivanju blede sve osim tačnih; dok se bira, ništa ne bledi
              // — nijedna ćelija još nije ni tačna ni netačna.
              opacity: revealing && !isRight ? 0.45 : 1,
            }}
          >
            <span>{cell}</span>
            {takers.length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '-0.4rem',
                  right: '-0.25rem',
                  display: 'flex',
                  gap: '0.1rem',
                }}
              >
                {takers.map((p) => (
                  <span
                    key={p.playerId}
                    title={p.name}
                    style={{
                      width: compact ? '1.1rem' : '1.4rem',
                      height: compact ? '1.1rem' : '1.4rem',
                      borderRadius: '50%',
                      background: p.avatarColor,
                      border:
                        p.playerId === myPlayerId
                          ? '2px solid #fff'
                          : '2px solid rgba(0,0,0,0.35)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: compact ? '0.6rem' : '0.72rem',
                    }}
                  >
                    {p.avatarEmoji}
                  </span>
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Koliko je ko pogodio — „2/3". Isti red koji TV crta ispod mreže. */
export function BitkaMatricaScoreRow({
  results,
  players,
  pick,
  myPlayerId,
}: {
  results: BitkaAnswerResult[];
  players: BitkaPlayerView[];
  pick: number;
  myPlayerId?: string;
}) {
  const rows = [...results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'center' }}>
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
              gap: '0.3rem',
              padding: '0.2rem 0.5rem',
              borderRadius: '999px',
              background: 'var(--bg-secondary)',
              border: `2px solid ${
                p.playerId === myPlayerId ? 'var(--accent)' : 'var(--line2)'
              }`,
              fontSize: '0.75rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
            }}
          >
            <span
              style={{
                width: '1.2rem',
                height: '1.2rem',
                borderRadius: '50%',
                background: p.avatarColor,
                display: 'grid',
                placeItems: 'center',
                fontSize: '0.65rem',
              }}
            >
              {p.avatarEmoji}
            </span>
            <span>{p.name}</span>
            <span style={{ color: score > 0 ? 'var(--accent)' : 'var(--dim)' }}>
              {score}/{pick}
            </span>
          </span>
        );
      })}
    </div>
  );
}


/**
 * Ekran matrice na telefonu — i biranje i otkrivanje, po istom rasporedu kao
 * izborno pitanje: zaglavlje, tekst, mreža, pa jedan red posledice.
 *
 * Izbor se drži lokalno i šalje se **jednom**, tek na „Pošalji": pravilo igre
 * je jedan odgovor po pitanju, a tri odvojena tapa bi inače značila tri
 * poluodgovora i pitanje ko je „prvi zaključao". Zato je i sat koji odlučuje
 * brzinu vezan za slanje, ne za prvi tap.
 */
export function BitkaMatricaScreen({
  question,
  host,
  header,
  footer,
  playerId,
  answered,
  mySelection,
  revealing,
  seconds,
  onSubmit,
}: {
  question: BitkaQuestionView;
  host: BitkaHostData;
  header: ReactNode;
  footer?: ReactNode;
  playerId: string;
  answered: boolean;
  mySelection: number[] | null;
  revealing: boolean;
  seconds: number;
  onSubmit: (cells: number[]) => void;
}) {
  const haptics = useHaptics();
  const pick = question.pick ?? 3;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Posle slanja (i u otkrivanju) mreža prikazuje ono što je server zapamtio,
  // ne lokalni izbor — na reconnect je lokalni prazan, a odgovor postoji.
  const shown = answered && mySelection ? new Set(mySelection) : selected;
  const locked = answered || revealing;

  const toggle = (i: number) => {
    if (locked) return;
    haptics.tap();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else if (next.size < pick) next.add(i);
      return next;
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '0.9rem',
        gap: '0.7rem',
      }}
    >
      {header}
      <p
        style={{
          margin: 0,
          fontSize: '1.05rem',
          fontWeight: 800,
          textAlign: 'center',
          lineHeight: 1.3,
        }}
      >
        {question.text}
      </p>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.6rem' }}>
        <BitkaMatricaCells
          cells={question.cells ?? []}
          selected={shown}
          correctCells={revealing ? host.correctCells : undefined}
          results={revealing ? (host.results ?? []) : undefined}
          players={host.players}
          myPlayerId={playerId}
          revealing={revealing}
          onToggle={locked ? undefined : toggle}
          disabled={locked}
        />
        {revealing && (
          <BitkaMatricaScoreRow
            results={host.results ?? []}
            players={host.players}
            pick={pick}
            myPlayerId={playerId}
          />
        )}
        {revealing && host.explanation && (
          <p style={{ margin: 0, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {host.explanation}
          </p>
        )}
      </div>
      {!revealing && !answered && (
        <button
          className="btn-primary"
          disabled={shown.size !== pick}
          onClick={() => {
            haptics.success();
            onSubmit([...shown]);
          }}
          style={{ minHeight: '52px', fontSize: '1rem', fontWeight: 800 }}
        >
          {shown.size === pick ? 'Pošalji' : `Izabrano ${shown.size}/${pick} · ${seconds}s`}
        </button>
      )}
      {footer}
    </div>
  );
}
