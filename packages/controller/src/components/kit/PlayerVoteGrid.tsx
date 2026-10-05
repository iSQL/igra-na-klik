import { useHaptics } from '../../hooks/useHaptics';

export interface VoteTile {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji?: string;
}

/**
 * Vote for a player (Kontroler kit 2d): big face tiles that are easy to hit in
 * a noisy room. After voting you stay here — your pick gets a gold ring and a
 * "Tvoj glas" tag, the others fade — instead of jumping to a separate page.
 */
export function PlayerVoteGrid({
  tiles,
  myPlayerId,
  votedFor,
  onVote,
}: {
  tiles: VoteTile[];
  myPlayerId: string;
  /** The tile the player already voted for; null while still choosing. */
  votedFor: string | null;
  onVote: (playerId: string) => void;
}) {
  const haptics = useHaptics();
  const locked = votedFor !== null;
  // Two columns up to 6 players; three beyond that so the grid still fits.
  const cols = tiles.length > 6 ? 3 : 2;
  const face = cols === 3 ? 58 : 76;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: 'minmax(120px, 1fr)',
        gap: 10,
      }}
    >
      {tiles.map((p) => {
        const selected = p.playerId === votedFor;
        return (
          <button
            key={p.playerId}
            onClick={() => {
              if (locked) return;
              haptics.tap();
              onVote(p.playerId);
            }}
            disabled={locked}
            aria-pressed={selected}
            style={{
              position: 'relative',
              borderRadius: 22,
              background: 'var(--bg-secondary)',
              border: selected ? '3px solid var(--accent)' : '1px solid var(--line)',
              boxShadow: selected ? '0 0 0 5px rgba(194,155,71,.2)' : 'none',
              opacity: locked && !selected ? 0.5 : 1,
              color: 'var(--text-primary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '0.75rem 0.5rem',
              transition: 'opacity .2s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span
              className="avatar-tile"
              style={{
                width: face,
                height: face,
                backgroundColor: p.avatarColor,
                fontSize: face / 2,
              }}
            >
              {p.avatarEmoji}
            </span>
            <span
              style={{
                fontWeight: 800,
                fontSize: cols === 3 ? '0.9rem' : '1.05rem',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {p.playerId === myPlayerId ? 'Ti' : p.name}
            </span>
            {selected && (
              <span
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: 7,
                  background: 'var(--accent)',
                  color: 'var(--bg-primary)',
                }}
              >
                Tvoj glas
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
