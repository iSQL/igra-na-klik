import { useRoomStore } from '../store/roomStore';

interface WaitingChipsProps {
  /** Players expected to answer this round (snapshot from the server). */
  expectedIds: string[];
  /** Subset of expectedIds that already answered. */
  answeredIds: string[];
}

/**
 * Row of player chips during an answering phase: answered players light up
 * with a check, the ones everyone is waiting on stay dimmed. Gives the
 * round some social pressure without leaking which option anyone picked.
 */
export function WaitingChips({ expectedIds, answeredIds }: WaitingChipsProps) {
  const players = useRoomStore((s) => s.players);
  const answered = new Set(answeredIds);

  const chips = expectedIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p != null);

  if (chips.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        justifyContent: 'center',
        maxWidth: '700px',
      }}
    >
      {chips.map((p) => {
        const done = answered.has(p.id);
        return (
          <span
            key={p.id}
            style={{
              background: 'var(--bg-card)',
              padding: '0.3rem 0.7rem',
              borderRadius: '0.5rem',
              fontSize: '0.9rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              borderLeft: `3px solid ${p.avatarColor}`,
              opacity: done ? 1 : 0.45,
              transition: 'opacity 0.25s',
            }}
          >
            <span style={{ fontSize: '1.05rem' }}>{p.avatarEmoji}</span>
            {p.name}
            {done && <span style={{ color: 'var(--success)' }}>✓</span>}
          </span>
        );
      })}
    </div>
  );
}
