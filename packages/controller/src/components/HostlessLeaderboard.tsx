// Full standings list for hostless rooms, where there is no TV showing the
// leaderboard between rounds. Quiz, Fibbage and Ko sam ja leaderboard
// entries all share this shape. In-game strings of these games are Serbian
// by design, so the titles passed in stay Serbian too.
interface LeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export function HostlessLeaderboard({
  title,
  entries,
  myPlayerId,
}: {
  title: string;
  entries: LeaderboardEntry[];
  myPlayerId: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '0.75rem',
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      <p
        className="display"
        style={{
          textAlign: 'center',
          fontSize: '1.25rem',
          fontWeight: 600,
          margin: 0,
        }}
      >
        {title}
      </p>
      {entries.map((entry) => {
        const isMe = entry.playerId === myPlayerId;
        const rankColor =
          entry.rank === 1
            ? 'var(--amber)'
            : entry.rank === 2
              ? '#C9CCE0'
              : entry.rank === 3
                ? '#D8916A'
                : 'var(--dim)';
        return (
          <div
            key={entry.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.7rem',
              padding: '0.65rem 0.85rem',
              background:
                entry.rank === 1
                  ? 'linear-gradient(90deg, rgba(227,180,94,.16), var(--bg-secondary))'
                  : isMe
                    ? 'linear-gradient(90deg, rgba(217,123,108,.14), var(--bg-secondary))'
                    : 'var(--bg-secondary)',
              borderRadius: '14px',
              border:
                entry.rank === 1
                  ? '1px solid rgba(227,180,94,.4)'
                  : isMe
                    ? '1px solid rgba(217,123,108,.4)'
                    : '1px solid var(--line)',
            }}
          >
            <span
              className="display"
              style={{
                fontWeight: 700,
                fontSize: '1.15rem',
                color: rankColor,
                minWidth: '1.4rem',
                textAlign: 'center',
              }}
            >
              {entry.rank}
            </span>
            <span
              className="avatar-tile"
              style={{
                width: '30px',
                height: '30px',
                backgroundColor: entry.avatarColor,
              }}
            />
            <span
              style={{
                flex: 1,
                fontWeight: 800,
                fontSize: '0.92rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.name}
            </span>
            <span
              className="display"
              style={{ fontWeight: 700, fontSize: '1.1rem' }}
            >
              {entry.score.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
