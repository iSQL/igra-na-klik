import { motion } from 'framer-motion';
import { useRoomStore } from '../../../store/roomStore';
import { formatBrojValue } from '@igra/shared';
import type {
  KvizDominoRoundResult,
  KvizMatricaRoundResult,
  KvizValueType,
} from '@igra/shared';

// ---- Domino (chronological streak) -----------------------------------------

interface DominoBoardEntry {
  playerId: string;
  streak: number;
  done: boolean;
}

/** TV progress board during answering — each player's live progress bar. */
export function DominoBoard({
  board,
  total,
  lowerLabel,
  higherLabel,
}: {
  board: DominoBoardEntry[];
  total: number;
  lowerLabel: string;
  higherLabel: string;
}) {
  const players = useRoomStore((s) => s.players);
  const maxStreak = Math.max(1, total - 1);
  const sorted = [...board].sort((a, b) => b.streak - a.streak);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        width: '100%',
      }}
    >
      <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', margin: 0 }}>
        Poredi na telefonu — <strong>{lowerLabel}</strong> ili{' '}
        <strong>{higherLabel}</strong>? Traje dok ne pogrešiš.
      </p>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          width: '100%',
          maxWidth: '620px',
        }}
      >
        {sorted.map((e) => {
          const p = players.find((pl) => pl.id === e.playerId);
          const frac = Math.min(1, e.streak / maxStreak);
          return (
            <div
              key={e.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.7rem',
                padding: '0.5rem 0.8rem',
                background: 'var(--bg-card)',
                borderRadius: '0.7rem',
                borderLeft: `5px solid ${p?.avatarColor ?? '#666'}`,
                opacity: e.done ? 0.75 : 1,
              }}
            >
              <span style={{ fontWeight: 700, flex: 1 }}>
                {p?.avatarEmoji ?? '👤'} {p?.name ?? '—'}
              </span>
              <div
                style={{
                  flex: 2,
                  height: 12,
                  borderRadius: 999,
                  background: 'var(--bg-secondary)',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  animate={{ width: `${frac * 100}%` }}
                  transition={{ duration: 0.3 }}
                  style={{ height: '100%', background: 'var(--accent)', borderRadius: 999 }}
                />
              </div>
              {e.done && (
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>✓</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Results: the revealed chain + per-player score. */
export function DominoResults({ result }: { result: KvizDominoRoundResult }) {
  const players = useRoomStore((s) => s.players);
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';
  const fmt = (v: number) =>
    formatBrojValue(v, result.unit, result.valueType as KvizValueType | undefined);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        width: '100%',
        overflowY: 'auto',
      }}
    >
      <p className="display" style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
        Pravi redosled
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.4rem',
          justifyContent: 'center',
          maxWidth: '1000px',
        }}
      >
        {result.items.map((it, i) => (
          <motion.div
            key={`${i}-${it.label}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.15rem',
              padding: '0.5rem 0.8rem',
              background: 'var(--bg-card)',
              borderRadius: '0.7rem',
              border: '1px solid var(--line2, rgba(255,255,255,.12))',
              minWidth: '120px',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '1rem', textAlign: 'center' }}>
              {it.label}
            </span>
            <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{fmt(it.value)}</span>
          </motion.div>
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {result.results.map((r) => (
          <div
            key={r.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.4rem 0.7rem',
              background: 'var(--bg-secondary)',
              borderRadius: '0.5rem',
              borderLeft: `5px solid ${r.avatarColor}`,
            }}
          >
            <span style={{ flex: 1, fontWeight: 600 }}>
              {emojiFor(r.playerId)} {r.name}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {r.streak}/{result.maxStreak} tačno
            </span>
            <span
              style={{
                fontWeight: 800,
                minWidth: '3.5rem',
                textAlign: 'right',
                color: r.roundScore > 0 ? '#7be37b' : 'var(--text-secondary)',
              }}
            >
              +{r.roundScore}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Matrica (3×3 association) ----------------------------------------------

/** Reusable 3×3 grid. `correct` cells get a gold ring; `wrong` a red ring. */
export function MatricaGrid({
  cells,
  correct,
  wrong,
}: {
  cells: string[];
  correct?: Set<number>;
  wrong?: Set<number>;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.45rem',
        width: '100%',
        maxWidth: '380px',
      }}
    >
      {cells.map((c, i) => {
        const isCorrect = correct?.has(i);
        const isWrong = wrong?.has(i);
        const border = isCorrect
          ? '2.5px solid var(--accent)'
          : isWrong
            ? '2.5px solid var(--danger)'
            : '1px solid var(--line2, rgba(255,255,255,.14))';
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              minHeight: '58px',
              padding: '0.35rem',
              background: isCorrect ? 'rgba(194,155,71,.16)' : 'var(--bg-card)',
              borderRadius: '0.6rem',
              border,
              fontWeight: 700,
              fontSize: '0.9rem',
              lineHeight: 1.15,
            }}
          >
            {c}
          </div>
        );
      })}
    </div>
  );
}

/** Matrica results: grid with the correct triple highlighted + explanation. */
export function MatricaResults({ result }: { result: KvizMatricaRoundResult }) {
  const players = useRoomStore((s) => s.players);
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';
  const correctSet = new Set(result.correct);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        width: '100%',
        overflowY: 'auto',
      }}
    >
      <MatricaGrid cells={result.cells} correct={correctSet} />
      {result.explanation && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            fontSize: '1.2rem',
            fontWeight: 700,
            color: 'var(--accent)',
            textAlign: 'center',
            margin: 0,
            maxWidth: '760px',
          }}
        >
          {result.explanation}
        </motion.p>
      )}
      <div style={{ width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {result.results.map((r) => (
          <div
            key={r.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.4rem 0.7rem',
              background: 'var(--bg-secondary)',
              borderRadius: '0.5rem',
              borderLeft: `5px solid ${r.avatarColor}`,
            }}
          >
            <span style={{ flex: 1, fontWeight: 600 }}>
              {emojiFor(r.playerId)} {r.name}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {r.hit === null ? '—' : `${r.hit}/3 tačno`}
            </span>
            <span
              style={{
                fontWeight: 800,
                minWidth: '3.5rem',
                textAlign: 'right',
                color: r.roundScore > 0 ? '#7be37b' : 'var(--text-secondary)',
              }}
            >
              +{r.roundScore}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
