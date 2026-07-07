import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import type { KoBiPreControllerData, KoBiPreHostData } from '@igra/shared';

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
    if (hostless && host.leaderboard) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '0.75rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
              Najviše glasova
            </p>
            <p style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0.2rem 0' }}>
              {top}
            </p>
            <p
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
                margin: 0,
              }}
            >
              {roundScore > 0 ? `+${roundScore} (pogodio si većinu!)` : '+0'}
            </p>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
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
      <div style={wrap}>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Najviše glasova
        </p>
        <p style={{ fontSize: '1.7rem', fontWeight: 800 }}>{top}</p>
        <p
          style={{
            fontSize: '1.3rem',
            fontWeight: 800,
            color: roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
          }}
        >
          {roundScore > 0 ? `+${roundScore}` : '+0'} poena
        </p>
        {roundScore > 0 && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Pogodio si većinu!
          </p>
        )}
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
