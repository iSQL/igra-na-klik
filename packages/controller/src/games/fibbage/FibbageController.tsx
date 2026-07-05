import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
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

    // Hostless room: append the TV's reveal (who fooled whom) under the
    // player's own result. data.results is shared/public round data.
    if (hostless && data.results) {
      const results = data.results as FibbageResultData;
      const fools = results.fools.filter((f) => f.fooledPlayerNames.length > 0);
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            gap: '0.75rem',
            padding: '1rem',
            overflowY: 'auto',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            Pravi odgovor
          </p>
          <p
            style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              color: 'var(--success)',
              margin: 0,
            }}
          >
            {results.realAnswer}
          </p>
          <p style={{ fontSize: '1rem', margin: '0.25rem 0' }}>
            {myData.foundTruth ? '✅ Pogodio/la si istinu!' : '❌ Nisi našao/la istinu'}
            {myData.fooledCount > 0 && ` · Prevario/la si ${myData.fooledCount}`}
            {' · '}
            <strong style={{ color: 'var(--accent)' }}>
              +{myData.roundScore}
            </strong>
          </p>
          {fools.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                textAlign: 'left',
              }}
            >
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

    if (hostless) {
      return (
        <HostlessLeaderboard
          title={phase === 'ended' ? 'Konačni poredak' : 'Rang lista'}
          entries={leaderboard}
          myPlayerId={playerId}
        />
      );
    }

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
