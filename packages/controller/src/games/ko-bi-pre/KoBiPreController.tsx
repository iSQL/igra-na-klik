import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { GameFrame } from '../../components/kit/GameFrame';
import { PlayerVoteGrid } from '../../components/kit/PlayerVoteGrid';
import { RoundVerdict, verdictWash } from '../../components/kit/RoundVerdict';
import type {
  KoBiPreControllerData,
  KoBiPreHostData,
  KoBiPreVoteTally,
} from '@igra/shared';

// Mirrors the module's VOTING_DURATION (active-input timer, hardcoded there as
// gameplay balance) — only used to draw the header's drain bar.
const VOTING_SECONDS = 30;

export default function KoBiPreController() {
  const gameState = useGameStore((s) => s.gameState);
  if (!gameState) return null;
  const { phase, timeRemaining, data } = gameState;
  const host = data.host as KoBiPreHostData | undefined;
  const round = host ? `Runda ${host.round}/${host.totalRounds}` : undefined;
  const subtitle =
    phase === 'ended'
      ? 'Kraj igre'
      : phase === 'showing-results' && round
        ? `${round} · Rezultat`
        : round;
  const voting = phase === 'voting';

  return (
    <GameFrame
      gameId="ko-bi-pre"
      subtitle={subtitle}
      roundCard={host ? { round: host.round, total: host.totalRounds } : undefined}
      timeRemaining={voting ? timeRemaining : undefined}
      timeTotal={voting ? VOTING_SECONDS : undefined}
    >
      <KoBiPrePhaseView />
    </GameFrame>
  );
}

function KoBiPrePhaseView() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);
  const roster = usePlayerStore((s) => s.room?.players ?? []);

  if (!gameState || !playerId) return null;

  const { phase, data, playerData } = gameState;
  const host = data.host as KoBiPreHostData;
  const my = playerData[playerId] as unknown as KoBiPreControllerData | undefined;

  // --- voting -----------------------------------------------------------
  if (phase === 'voting') {
    const votedFor = my?.hasVoted ? (my.votedFor ?? null) : null;
    const votedName = my?.voteOptions?.find((o) => o.playerId === votedFor)?.name;
    // Prompts all open with "Ko bi pre" — it moves to the eyebrow so the big
    // line is just the part that changes.
    const rest = host.prompt.replace(/^Ko bi pre\s*/i, '');
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          paddingTop: '1.5rem',
          gap: '1.4rem',
        }}
      >
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--amber)',
            }}
          >
            Ko bi pre…
          </span>
          <p
            className="display"
            style={{
              margin: '6px 0 0',
              fontSize: '1.7rem',
              fontWeight: 600,
              lineHeight: 1.2,
              textWrap: 'balance',
            }}
          >
            {rest || host.prompt}
          </p>
        </div>
        <PlayerVoteGrid
          tiles={(my?.voteOptions ?? []).map((o) => ({
            ...o,
            avatarEmoji: roster.find((p) => p.id === o.playerId)?.avatarEmoji,
          }))}
          myPlayerId={playerId}
          votedFor={votedFor}
          onVote={(targetId) =>
            socket.emit('game:player-action', {
              action: 'kobipre:vote',
              data: { targetId },
            })
          }
        />
        <p
          style={{
            flexShrink: 0,
            margin: 0,
            textAlign: 'center',
            fontSize: '0.88rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
          }}
        >
          {votedName && (
            <>
              Glas poslat za{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {votedFor === playerId ? 'sebe' : votedName}
              </strong>{' '}
              ·{' '}
            </>
          )}
          {host.votedCount ?? 0}/{host.totalVoters ?? 0} glasalo
        </p>
      </div>
    );
  }

  // --- showing-results --------------------------------------------------
  if (phase === 'showing-results') {
    const roundScore = my?.ownRoundScore ?? 0;
    const top = host.topNames?.join(', ') ?? '—';
    const tally = host.voteTally ?? [];

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          overflowY: 'auto',
          padding: '1.5rem 0 0.5rem',
          gap: '1.4rem',
          background: verdictWash(roundScore > 0 ? 'correct' : 'neutral'),
        }}
      >
        <RoundVerdict
          kind={roundScore > 0 ? 'correct' : 'neutral'}
          icon="👑"
          title={top}
          points={roundScore}
        />
        <p
          style={{
            margin: '-0.8rem 0 0',
            textAlign: 'center',
            fontSize: '0.9rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
          }}
        >
          {roundScore > 0 ? 'Pogodio/la si većinu!' : 'Najviše glasova'}
        </p>
        <VoteBreakdown tally={tally} myPlayerId={playerId} />
        {hostless && host.leaderboard && (
          <HostlessLeaderboard
            title="Rang lista"
            entries={host.leaderboard}
            myPlayerId={playerId}
            embedded
          />
        )}
      </div>
    );
  }

  // --- ended ------------------------------------------------------------
  if (phase === 'ended' && host.leaderboard) {
    return (
      <HostlessLeaderboard
        title="Konačni poredak"
        entries={host.leaderboard}
        myPlayerId={playerId}
      />
    );
  }

  return null;
}

// Who got votes this round: face, name, one line of voter names, count —
// the same row shape as the quiz result (Kontroler kit 2e).
function VoteBreakdown({
  tally,
  myPlayerId,
}: {
  tally: KoBiPreVoteTally[];
  myPlayerId: string;
}) {
  const roster = usePlayerStore((s) => s.room?.players ?? []);
  const voted = tally.filter((t) => t.votes > 0);
  if (voted.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {voted.map((t) => {
        const voters = t.voters
          .slice()
          .sort((a, b) => Number(b.playerId === myPlayerId) - Number(a.playerId === myPlayerId))
          .map((v) => (v.playerId === myPlayerId ? 'Ti' : v.name));
        return (
          <div
            key={t.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minHeight: 56,
              padding: '8px 12px',
              borderRadius: 16,
              background: t.isTop ? 'rgba(87,179,128,.14)' : 'var(--bg-secondary)',
              border: t.isTop ? '2px solid var(--success)' : '1px solid var(--line)',
            }}
          >
            <span
              className="avatar-tile"
              style={{ width: 36, height: 36, backgroundColor: t.avatarColor, fontSize: '1.1rem' }}
            >
              {roster.find((p) => p.id === t.playerId)?.avatarEmoji}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                {t.playerId === myPlayerId ? 'Ti' : t.name}
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                {voters.join(', ')}
              </span>
            </span>
            <span
              className="display"
              style={{
                fontWeight: 700,
                fontSize: '1.3rem',
                color: t.isTop ? 'var(--success-ink)' : 'var(--text-secondary)',
              }}
            >
              {t.votes}
            </span>
          </div>
        );
      })}
    </div>
  );
}
