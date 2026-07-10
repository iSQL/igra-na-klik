import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import type {
  KoBiPreControllerData,
  KoBiPreHostData,
  KoBiPreVoteTally,
} from '@igra/shared';

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '1rem',
  textAlign: 'center',
  padding: '1rem',
};

export default function KoBiPreController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as KoBiPreHostData;
  const my = playerData[playerId] as unknown as KoBiPreControllerData | undefined;

  // --- voting -----------------------------------------------------------
  if (phase === 'voting') {
    if (my?.hasVoted) {
      const votedName = my.voteOptions?.find(
        (o) => o.playerId === my.votedFor
      )?.name;
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
            Glasao si za
          </p>
          <p style={{ fontSize: '1.9rem', fontWeight: 800 }}>{votedName}</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {host.votedCount}/{host.totalVoters} glasalo
          </p>
        </div>
      );
    }
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          padding: '1rem',
          gap: '0.75rem',
        }}
      >
        <p style={{ fontSize: '1.3rem', fontWeight: 800, textAlign: 'center' }}>
          {host.prompt}
        </p>
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            margin: 0,
          }}
        >
          {timeRemaining}s
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            overflowY: 'auto',
          }}
        >
          {my?.voteOptions?.map((o) => (
            <button
              key={o.playerId}
              onClick={() => socket.emit('game:player-action', {
                action: 'kobipre:vote',
                data: { targetId: o.playerId },
              })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                border: 'none',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontWeight: 700,
                fontSize: '1.05rem',
                borderLeft: `6px solid ${o.avatarColor}`,
              }}
            >
              {o.name}
              {o.playerId === playerId && ' (ti)'}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- showing-results --------------------------------------------------
  if (phase === 'showing-results') {
    const roundScore = my?.ownRoundScore ?? 0;
    const top = host.topNames?.join(', ');
    const tally = host.voteTally ?? [];

    const summary = (
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
          Najviše glasova
        </p>
        <p style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0.15rem 0' }}>
          👑 {top}
        </p>
        <p
          style={{
            fontSize: '1.05rem',
            fontWeight: 800,
            color: roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
            margin: 0,
          }}
        >
          {roundScore > 0 ? `+${roundScore} · pogodio si većinu!` : '+0'}
        </p>
      </div>
    );

    if (hostless && host.leaderboard) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.7rem',
            }}
          >
            {summary}
            <VoteBreakdown tally={tally} myPlayerId={playerId} />
          </div>
          <div style={{ flex: 1, minHeight: 0, borderTop: '1px solid var(--line)' }}>
            <HostlessLeaderboard
              title="Rang lista"
              entries={host.leaderboard}
              myPlayerId={playerId}
            />
          </div>
        </div>
      );
    }
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          overflowY: 'auto',
          padding: '1rem',
          gap: '0.8rem',
          alignItems: 'center',
        }}
      >
        {summary}
        <VoteBreakdown tally={tally} myPlayerId={playerId} />
      </div>
    );
  }

  // --- ended ------------------------------------------------------------
  if (phase === 'ended') {
    const entry = host.leaderboard?.find((e) => e.playerId === playerId);
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Konačni plasman
        </p>
        {entry && (
          <>
            <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)' }}>
              #{entry.rank}
            </p>
            <p style={{ fontSize: '1.4rem', fontWeight: 600 }}>
              {entry.score.toLocaleString()} poena
            </p>
          </>
        )}
      </div>
    );
  }

  return null;
}

// Per-target breakdown of who voted for whom this round.
function VoteBreakdown({
  tally,
  myPlayerId,
}: {
  tally: KoBiPreVoteTally[];
  myPlayerId: string;
}) {
  const voted = tally.filter((t) => t.votes > 0);
  if (voted.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        width: '100%',
        maxWidth: '460px',
      }}
    >
      {voted.map((t) => (
        <div
          key={t.playerId}
          style={{
            padding: '0.6rem 0.7rem',
            borderRadius: '14px',
            background: t.isTop ? 'rgba(47,224,138,.12)' : 'var(--bg-secondary)',
            border: `1px solid ${t.isTop ? 'var(--success)' : 'var(--line2)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '4px',
                background: t.avatarColor,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: '1rem' }}>
              {t.isTop ? '👑 ' : ''}
              {t.name}
              {t.playerId === myPlayerId ? ' (ti)' : ''}
            </span>
            <span style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>
              {t.votes}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
            {t.voters.map((v) => (
              <span
                key={v.playerId}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.1rem 0.45rem 0.1rem 0.15rem',
                  borderRadius: '999px',
                  background: 'var(--bg-card)',
                  border:
                    v.playerId === myPlayerId
                      ? '1px solid var(--text-secondary)'
                      : '1px solid var(--line2)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
              >
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: v.avatarColor,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '0.65rem',
                    flexShrink: 0,
                  }}
                >
                  {v.avatarEmoji}
                </span>
                {v.playerId === myPlayerId ? 'Ti' : v.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
