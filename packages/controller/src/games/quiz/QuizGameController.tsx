import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { AnswerButtons } from './components/AnswerButtons';
import { WaitingForResults } from './components/WaitingForResults';
import { RoundResult } from './components/RoundResult';
import type { QuizOption, QuizResultData, QuizLeaderboardEntry } from '@igra/shared';

export default function QuizGameController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);

  if (!gameState || !playerId) return null;

  const { phase, data, playerData } = gameState;
  const myData = playerData[playerId] as
    | { hasAnswered: boolean; selectedIndex: number | null }
    | undefined;

  if (phase === 'showing-question') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1rem',
        }}
      >
        <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>Spremi se!</p>
        <p style={{ color: 'var(--text-secondary)' }}>
          Pitanje {(data.questionIndex as number) + 1}/{data.totalQuestions as number}
        </p>
      </div>
    );
  }

  if (phase === 'answering') {
    const options = data.options as QuizOption[];
    const hasAnswered = myData?.hasAnswered ?? false;
    const selectedIndex = myData?.selectedIndex ?? null;

    if (hasAnswered && selectedIndex !== null) {
      const selectedOption = options.find((o) => o.index === selectedIndex);
      return (
        <WaitingForResults
          selectedIndex={selectedIndex}
          optionColor={selectedOption?.color ?? 'var(--accent)'}
        />
      );
    }

    return (
      <AnswerButtons
        options={options}
        hasAnswered={hasAnswered}
        selectedIndex={selectedIndex}
      />
    );
  }

  if (phase === 'showing-results' && data.results) {
    return <RoundResult results={data.results as QuizResultData} />;
  }

  if ((phase === 'leaderboard' || phase === 'ended') && data.leaderboard) {
    const leaderboard = data.leaderboard as QuizLeaderboardEntry[];
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
