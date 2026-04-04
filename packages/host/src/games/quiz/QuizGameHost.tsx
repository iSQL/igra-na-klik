import { useGameStore } from '../../store/gameStore';
import { QuestionDisplay } from './components/QuestionDisplay';
import { OptionGrid } from './components/OptionGrid';
import { AnswerCounter } from './components/AnswerCounter';
import { ResultsReveal } from './components/ResultsReveal';
import { Leaderboard } from './components/Leaderboard';
import type { QuizOption, QuizResultData, QuizLeaderboardEntry } from '@igra/shared';

export default function QuizGameHost() {
  const gameState = useGameStore((s) => s.gameState);
  if (!gameState) return null;

  const { phase, timeRemaining, data } = gameState;
  const questionIndex = data.questionIndex as number;
  const totalQuestions = data.totalQuestions as number;
  const questionText = data.questionText as string | undefined;
  const options = data.options as QuizOption[] | undefined;
  const timeLimit = (data.timeLimit as number) || 15;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        padding: '2rem',
        width: '100%',
        maxWidth: '900px',
      }}
    >
      {phase === 'showing-question' && questionText && (
        <>
          <QuestionDisplay
            questionText={questionText}
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
            timeRemaining={timeRemaining}
            timeLimit={3}
          />
          <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
            Get ready...
          </p>
        </>
      )}

      {phase === 'answering' && questionText && options && (
        <>
          <QuestionDisplay
            questionText={questionText}
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
            timeRemaining={timeRemaining}
            timeLimit={timeLimit}
          />
          <OptionGrid options={options} showResults={false} />
          <AnswerCounter
            answeredCount={data.answeredCount as number}
            totalPlayers={data.totalPlayers as number}
          />
        </>
      )}

      {phase === 'showing-results' && data.results != null && (
        <ResultsReveal results={data.results as QuizResultData} />
      )}

      {phase === 'leaderboard' && data.leaderboard != null && (
        <Leaderboard
          entries={data.leaderboard as QuizLeaderboardEntry[]}
          isFinal={questionIndex === totalQuestions - 1}
        />
      )}

      {phase === 'ended' && data.leaderboard != null && (
        <Leaderboard
          entries={data.leaderboard as QuizLeaderboardEntry[]}
          isFinal={true}
        />
      )}
    </div>
  );
}
