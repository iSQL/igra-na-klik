import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { AnswerInput } from './components/AnswerInput';
import { VoteOptions } from './components/VoteOptions';
import { WaitingScreen } from './components/WaitingScreen';
import { RoundResult } from './components/RoundResult';
import type {
  FibbageQuestionPublic,
  FibbageAnswerOptionPublic,
  FibbageResultData,
  FibbageLeaderboardEntry,
} from '@igra/shared';

export default function FibbageController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  if (!gameState || !playerId) return null;

  const { phase, data, playerData } = gameState;
  const question = data.question as FibbageQuestionPublic | undefined;

  if (phase === 'showing-question') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1.25rem',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
          Pitanje {(data.questionIndex as number) + 1}/{data.totalQuestions as number}
        </p>
        {question?.text && (
          <p style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.3, margin: 0 }}>
            {question.text}
          </p>
        )}
      </div>
    );
  }

  if (phase === 'writing-answers' && question) {
    const myData = playerData[playerId] as
      | { hasSubmitted: boolean; isAutoFinder: boolean }
      | undefined;

    if (myData?.isAutoFinder) {
      return (
        <WaitingScreen
          message="Znao/la si odgovor!"
          subMessage="Čekamo ostale da napišu svoje laži..."
        />
      );
    }

    if (myData?.hasSubmitted) {
      return (
        <WaitingScreen
          message="Poslato!"
          subMessage="Čekamo ostale..."
        />
      );
    }

    return <AnswerInput questionText={question.text} />;
  }

  if (phase === 'voting') {
    const options = (data.options as FibbageAnswerOptionPublic[]) ?? [];
    const myData = playerData[playerId] as
      | {
          hasVoted: boolean;
          votedOptionId: string | null;
          myFakeOptionId: string | null;
          isAutoFinder: boolean;
        }
      | undefined;

    const voteBody = (
      <VoteOptions
        options={options}
        hasVoted={myData?.hasVoted ?? false}
        votedOptionId={myData?.votedOptionId ?? null}
        myFakeOptionId={myData?.myFakeOptionId ?? null}
        isAutoFinder={myData?.isAutoFinder ?? false}
      />
    );

    // Hostless room: the question lives only on the TV otherwise — show it
    // above the vote options so players know what they're voting on.
    if (hostless && question) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '0.5rem',
          }}
        >
          <p
            style={{
              textAlign: 'center',
              fontSize: '1rem',
              fontWeight: 700,
              lineHeight: 1.3,
              margin: '0.5rem 0.75rem',
            }}
          >
            {question.text}
          </p>
          <div style={{ flex: 1, minHeight: 0 }}>{voteBody}</div>
        </div>
      );
    }

    return voteBody;
  }

  // Hostless room: results and leaderboard phases render one merged screen
  // (real answer + standings with per-round "+N" deltas + who fooled whom),
  // so the phase switch doesn't look like a second screen.
  if (
    hostless &&
    (phase === 'showing-results' || phase === 'leaderboard' || phase === 'ended') &&
    data.results &&
    data.leaderboard
  ) {
    return (
      <FibbageMergedResults
        results={data.results as FibbageResultData}
        leaderboard={data.leaderboard as FibbageLeaderboardEntry[]}
        myPlayerId={playerId}
        isFinal={phase === 'ended'}
      />
    );
  }

  if (phase === 'showing-results') {
    const myData = playerData[playerId] as
      | {
          foundTruth: boolean;
          fooledCount: number;
          roundScore: number;
          realAnswer: string;
        }
      | undefined;

    if (!myData) return null;

    return (
      <RoundResult
        foundTruth={myData.foundTruth}
        fooledCount={myData.fooledCount}
        roundScore={myData.roundScore}
        realAnswer={myData.realAnswer}
      />
    );
  }

  if ((phase === 'leaderboard' || phase === 'ended') && data.leaderboard) {
    const leaderboard = data.leaderboard as FibbageLeaderboardEntry[];
    const myEntry = leaderboard.find((e) => e.playerId === playerId);

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1rem',
          textAlign: 'center',
        }}
      >
        {myEntry && (
          <>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
              {phase === 'ended' ? 'Konačno mesto' : 'Tvoje mesto'}
            </p>
            <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)' }}>
              #{myEntry.rank}
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              {myEntry.score.toLocaleString()} poena
            </p>
          </>
        )}
      </div>
    );
  }

  return null;
}

// Hostless one-screen reveal: correct answer on top, standings with the
// round's "+N" beside each total, then the who-fooled-whom cards.
function FibbageMergedResults({
  results,
  leaderboard,
  myPlayerId,
  isFinal,
}: {
  results: FibbageResultData;
  leaderboard: FibbageLeaderboardEntry[];
  myPlayerId: string;
  isFinal: boolean;
}) {
  const fools = results.fools.filter((f) => f.fooledPlayerNames.length > 0);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '0.6rem',
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      <p
        style={{
          textAlign: 'center',
          fontSize: '0.72rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        {isFinal ? 'Konačni poredak · Pravi odgovor' : 'Pravi odgovor'}
      </p>
      <p
        className="display"
        style={{
          alignSelf: 'center',
          fontSize: '1.35rem',
          fontWeight: 700,
          color: 'var(--success)',
          background: 'rgba(47,224,138,.14)',
          border: '1px solid var(--success)',
          padding: '0.55rem 1.1rem',
          borderRadius: '14px',
          margin: 0,
          lineHeight: 1.3,
          animation: 'igra-pop .4s',
        }}
      >
        ✓ {results.realAnswer}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {leaderboard.map((entry) => {
          const isMe = entry.playerId === myPlayerId;
          const delta = entry.roundScore ?? 0;
          return (
            <div
              key={entry.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                padding: '0.55rem 0.75rem',
                background: isMe
                  ? 'linear-gradient(90deg, rgba(255,46,136,.14), var(--bg-secondary))'
                  : 'var(--bg-secondary)',
                borderRadius: '12px',
                border: isMe
                  ? '1px solid rgba(255,46,136,.4)'
                  : '1px solid var(--line)',
                fontSize: '0.9rem',
              }}
            >
              <span
                className="display"
                style={{
                  fontWeight: 700,
                  color:
                    entry.rank === 1
                      ? 'var(--amber)'
                      : entry.rank === 2
                        ? '#C9CCE0'
                        : entry.rank === 3
                          ? '#D8916A'
                          : 'var(--dim)',
                  minWidth: '1.4rem',
                  textAlign: 'center',
                }}
              >
                {entry.rank}
              </span>
              <span
                className="avatar-tile"
                style={{ width: '26px', height: '26px', backgroundColor: entry.avatarColor }}
              />
              <span
                style={{
                  flex: 1,
                  fontWeight: 800,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.name}
              </span>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  color: delta > 0 ? 'var(--success)' : 'var(--dim)',
                  background:
                    delta > 0 ? 'rgba(47,224,138,.15)' : 'rgba(255,255,255,.05)',
                  padding: '2px 7px',
                  borderRadius: '7px',
                }}
              >
                +{delta}
              </span>
              <span
                className="display"
                style={{ fontWeight: 700, minWidth: '3.2rem', textAlign: 'right' }}
              >
                {entry.score.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>

      {fools.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {fools.map((f) => (
            <div
              key={f.optionId}
              style={{
                padding: '0.6rem 0.8rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--line)',
                borderRadius: '12px',
                fontSize: '0.85rem',
                lineHeight: 1.45,
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  color: 'var(--pink)',
                  background: 'rgba(255,46,136,.14)',
                  padding: '2px 8px',
                  borderRadius: '7px',
                  fontSize: '0.78rem',
                }}
              >
                {f.fakerNames.join(', ')} 🤥
              </span>{' '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                „{f.optionText}" nasamario/la:
              </span>{' '}
              <strong>{f.fooledPlayerNames.join(', ')}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
