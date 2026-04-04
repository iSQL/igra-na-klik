import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { AnswerInput } from './components/AnswerInput';
import { VoteOptions } from './components/VoteOptions';
import { WaitingScreen } from './components/WaitingScreen';
import { RoundResult } from './components/RoundResult';
import type {
  FibbageQuestionPublic,
  FibbageAnswerOptionPublic,
  FibbageLeaderboardEntry,
} from '@igra/shared';

export default function FibbageController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);

  if (!gameState || !playerId) return null;

  const { phase, data, playerData } = gameState;
  const question = data.question as FibbageQuestionPublic | undefined;

  if (phase === 'showing-question') {
    return (
      <WaitingScreen
        message="Spremi se..."
        subMessage={`Pitanje ${(data.questionIndex as number) + 1}/${data.totalQuestions as number}`}
      />
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

    return (
      <VoteOptions
        options={options}
        hasVoted={myData?.hasVoted ?? false}
        votedOptionId={myData?.votedOptionId ?? null}
        myFakeOptionId={myData?.myFakeOptionId ?? null}
        isAutoFinder={myData?.isAutoFinder ?? false}
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
