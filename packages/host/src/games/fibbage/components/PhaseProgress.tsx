import { WaitingChips } from '../../../components/WaitingChips';

export interface FibbageProgressEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  done: boolean;
}

interface PhaseProgressProps {
  /** Server-sent per-player progress for the running phase. */
  entries: FibbageProgressEntry[];
  /** Headline above the chips, e.g. "Igrači pišu svoje laži…". */
  title: string;
  /** Word after the count, e.g. "napisalo laž". */
  countLabel: string;
  /** Optional note under the chips (e.g. how many already found the truth). */
  note?: string;
}

/**
 * Count + a chip per player for the writing and voting phases. Replaces the
 * bare "3/6": with names on screen the room can see who everyone is waiting
 * for, which is the whole social pressure of the phase. Only the `done`
 * boolean is ever shown — never what anybody wrote or picked.
 */
export function PhaseProgress({
  entries,
  title,
  countLabel,
  note,
}: PhaseProgressProps) {
  const doneCount = entries.filter((e) => e.done).length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          padding: '0.75rem 2rem',
          background: 'var(--bg-secondary)',
          borderRadius: '0.75rem',
        }}
      >
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {title}
        </p>
        <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>
          {doneCount}/{entries.length}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {countLabel}
        </p>
      </div>

      <WaitingChips
        expectedIds={entries.map((e) => e.playerId)}
        answeredIds={entries.filter((e) => e.done).map((e) => e.playerId)}
      />

      {note && (
        <p
          style={{
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
            margin: 0,
          }}
        >
          {note}
        </p>
      )}
    </div>
  );
}
