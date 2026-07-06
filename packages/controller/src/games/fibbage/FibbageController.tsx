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
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        {isFinal ? 'Konačni poredak · Pravi odgovor' : 'Pravi odgovor'}
      </p>
      <p
        style={{
          textAlign: 'center',
          fontSize: '1.4rem',
          fontWeight: 800,
          color: 'var(--success)',
          margin: 0,
          lineHeight: 1.3,
        }}
      >
        {results.realAnswer}
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
                gap: '0.5rem',
                padding: '0.5rem 0.7rem',
                background: isMe ? 'var(--bg-card)' : 'var(--bg-secondary)',
                borderRadius: '0.5rem',
                borderLeft: `4px solid ${entry.avatarColor}`,
                outline: isMe ? '1px solid var(--accent)' : undefined,
                fontSize: '0.9rem',
              }}
            >
              <span style={{ fontWeight: 800, color: 'var(--accent)', minWidth: '1.8rem' }}>
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
              <span
                style={{
                  fontWeight: 700,
                  color: delta > 0 ? 'var(--success)' : 'var(--text-secondary)',
                }}
              >
                +{delta}
              </span>
              <span style={{ fontWeight: 600, minWidth: '3.2rem', textAlign: 'right' }}>
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
                padding: '0.5rem 0.7rem',
                background: 'var(--bg-card)',
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
                lineHeight: 1.4,
              }}
            >
              <strong>{f.fakerNames.join(', ')}</strong>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                „{f.optionText}" prevario/la:
              </span>{' '}
              {f.fooledPlayerNames.join(', ')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
