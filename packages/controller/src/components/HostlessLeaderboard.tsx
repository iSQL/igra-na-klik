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
        style={{
          textAlign: 'center',
          fontSize: '1.1rem',
          fontWeight: 700,
          margin: 0,
        }}
      >
        {title}
      </p>
      {entries.map((entry) => {
        const isMe = entry.playerId === myPlayerId;
        return (
          <div
            key={entry.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.55rem 0.8rem',
              background: isMe ? 'var(--bg-card)' : 'var(--bg-secondary)',
              borderRadius: '0.6rem',
              borderLeft: `4px solid ${entry.avatarColor}`,
              outline: isMe ? '1px solid var(--accent)' : undefined,
            }}
          >
            <span
              style={{
                fontWeight: 800,
                color: 'var(--accent)',
                minWidth: '2rem',
              }}
            >
              #{entry.rank}
            </span>
            <span
              style={{
                flex: 1,
                fontWeight: isMe ? 700 : 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.name}
            </span>
            <span style={{ fontWeight: 600 }}>
              {entry.score.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
