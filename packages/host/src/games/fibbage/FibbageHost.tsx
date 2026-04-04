import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { QuestionCard } from './components/QuestionCard';
import { SubmissionCounter } from './components/SubmissionCounter';
import { AnswerOptions } from './components/AnswerOptions';
import { VoteCounter } from './components/VoteCounter';
import { ResultsReveal } from './components/ResultsReveal';
import { Leaderboard } from '../quiz/components/Leaderboard';
import type {
  FibbageQuestionPublic,
  FibbageAnswerOptionPublic,
  FibbageResultData,
  FibbageLeaderboardEntry,
} from '@igra/shared';

export default function FibbageHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTimeRef = useRef<number>(Infinity);

  useEffect(() => {
    if (!gameState) return;
    const { phase, timeRemaining } = gameState;

    if (phase !== prevPhaseRef.current) {
      if (phase === 'showing-results') play('reveal');
      if (phase === 'ended') play('victory');
      prevPhaseRef.current = phase;
    }

    if (phase === 'writing-answers' || phase === 'voting') {
      const currSec = Math.ceil(timeRemaining);
      const prevSec = Math.ceil(prevTimeRef.current);
      if (currSec !== prevSec && currSec <= 5 && currSec > 0) {
        play('tick');
      }
    }
    prevTimeRef.current = timeRemaining;
  }, [gameState, play]);

  if (!gameState) return null;

  const { phase, timeRemaining, data } = gameState;
  const questionIndex = data.questionIndex as number;
  const totalQuestions = data.totalQuestions as number;
  const question = data.question as FibbageQuestionPublic | undefined;

  const phaseLabel =
    phase === 'showing-question'
      ? 'Pročitaj pitanje'
      : phase === 'writing-answers'
        ? 'Pišite laži'
        : phase === 'voting'
          ? 'Glasajte'
          : undefined;

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
      {(phase === 'showing-question' ||
        phase === 'writing-answers' ||
        phase === 'voting') &&
        question && (
          <QuestionCard
            questionText={question.text}
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
            timeRemaining={timeRemaining}
            phaseLabel={phaseLabel}
          />
        )}

      {phase === 'showing-question' && (
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          Spremi se...
        </p>
      )}

      {phase === 'writing-answers' && (
        <SubmissionCounter
          submittedCount={(data.submittedCount as number) ?? 0}
          totalPlayers={(data.totalPlayers as number) ?? 0}
        />
      )}

      {phase === 'voting' && (
        <>
          <AnswerOptions
            options={(data.options as FibbageAnswerOptionPublic[]) ?? []}
          />
          <VoteCounter
            votedCount={(data.votedCount as number) ?? 0}
            totalPlayers={(data.totalPlayers as number) ?? 0}
          />
        </>
      )}

      {phase === 'showing-results' && data.results != null && (
        <ResultsReveal results={data.results as FibbageResultData} />
      )}

      {phase === 'leaderboard' && data.leaderboard != null && (
        <Leaderboard
          entries={data.leaderboard as FibbageLeaderboardEntry[]}
          isFinal={questionIndex === totalQuestions - 1}
        />
      )}

      {phase === 'ended' && data.leaderboard != null && (
        <Leaderboard
          entries={data.leaderboard as FibbageLeaderboardEntry[]}
          isFinal={true}
        />
      )}
    </div>
  );
}
