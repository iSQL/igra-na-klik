import type { ReactNode } from 'react';
import { usePlayerStore } from '../../store/playerStore';

export interface ProgressPlayer {
  playerId: string;
  done: boolean;
}

/**
 * Waiting phase after you've committed (Kontroler kit 2b): what you picked as
 * the hero, then a live "who's in" grid. With no TV that grid is the only
 * place to see who the room is still waiting on.
 */
export function WaitingPanel({
  hero,
  title,
  subtitle,
  progressLabel,
  players,
}: {
  hero: ReactNode;
  title: string;
  subtitle?: string;
  /** Heading of the grid, e.g. "Ko je odgovorio". */
  progressLabel: string;
  players: ProgressPlayer[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: '0.25rem' }}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          textAlign: 'center',
          padding: '1rem 0',
        }}
      >
        {hero}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="display" style={{ fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.1 }}>
            {title}
          </span>
          {subtitle && (
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              {subtitle}
            </span>
          )}
        </div>
      </div>
      {players.length > 0 && <WhoIsIn label={progressLabel} players={players} />}
    </div>
  );
}

/** Card with a ✓ / … badge per expected player. */
export function WhoIsIn({ label, players }: { label: string; players: ProgressPlayer[] }) {
  const roster = usePlayerStore((s) => s.room?.players ?? []);
  const myId = usePlayerStore((s) => s.player?.id);
  const doneCount = players.filter((p) => p.done).length;

  return (
    <div
      style={{
        flexShrink: 0,
        padding: 16,
        borderRadius: 20,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxHeight: '40%',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 800 }}>
        <span>{label}</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          {doneCount}/{players.length}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {players.map((p) => {
          const r = roster.find((x) => x.id === p.playerId);
          return (
            <div
              key={p.playerId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                minWidth: 0,
                opacity: p.done ? 1 : 0.55,
              }}
            >
              <span
                className="avatar-tile"
                style={{
                  position: 'relative',
                  width: 48,
                  height: 48,
                  backgroundColor: r?.avatarColor ?? 'var(--bg-card)',
                  fontSize: '1.5rem',
                  filter: p.done ? 'none' : 'grayscale(.6)',
                }}
              >
                {r?.avatarEmoji}
                <span
                  aria-label={p.done ? '✓' : '…'}
                  style={{
                    position: 'absolute',
                    right: -4,
                    bottom: -4,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: p.done ? 'var(--success)' : 'var(--dim)',
                    color: 'var(--bg-primary)',
                    border: '2px solid var(--bg-secondary)',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {p.done ? '✓' : '…'}
                </span>
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.playerId === myId ? 'Ti' : (r?.name ?? '?')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Small overlapping faces + "2/4 odgovorilo" line under an input screen. */
export function DoneFaces({ players, verb }: { players: ProgressPlayer[]; verb: string }) {
  const roster = usePlayerStore((s) => s.room?.players ?? []);
  const done = players.filter((p) => p.done);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontSize: '0.82rem',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        flexShrink: 0,
      }}
    >
      {done.length > 0 && (
        <span style={{ display: 'flex' }} aria-hidden>
          {done.slice(0, 5).map((p, i) => {
            const r = roster.find((x) => x.id === p.playerId);
            return (
              <span
                key={p.playerId}
                style={{
                  width: 22,
                  height: 22,
                  marginLeft: i === 0 ? 0 : -6,
                  borderRadius: '50%',
                  background: r?.avatarColor ?? 'var(--bg-card)',
                  border: '2px solid var(--bg-primary)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '0.68rem',
                }}
              >
                {r?.avatarEmoji}
              </span>
            );
          })}
        </span>
      )}
      {done.length}/{players.length} {verb}
    </div>
  );
}
