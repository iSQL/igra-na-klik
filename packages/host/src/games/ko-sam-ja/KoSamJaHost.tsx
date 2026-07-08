import { useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { QuestionCard } from '../fibbage/components/QuestionCard';
import { Leaderboard } from '../quiz/components/Leaderboard';
import { CollectingUpfrontProgress } from './components/CollectingUpfrontProgress';
import { SubjectPickingDisplay } from './components/SubjectPickingDisplay';
import { GuessingDisplay } from './components/GuessingDisplay';
import { ResultsReveal } from './components/ResultsReveal';
import type {
  KoSamJaPublicOption,
  KoSamJaResultData,
  KoSamJaLeaderboardEntry,
} from '@igra/shared';

export default function KoSamJaHost() {
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

    if (
      phase === 'subject-picking' ||
      phase === 'guessing' ||
      phase === 'collecting-upfront'
    ) {
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
  const roundIndex = (data.roundIndex as number) ?? 0;
  const totalRounds = (data.totalRounds as number) ?? 0;
  const currentQuestionText = data.currentQuestionText as string | undefined;
  const currentSubjectName = data.currentSubjectName as string | undefined;

  const phaseLabel =
    phase === 'showing-question'
      ? 'Pročitaj pitanje'
      : phase === 'subject-picking'
        ? `${currentSubjectName ?? ''} bira`
        : phase === 'guessing'
          ? 'Pogađaj'
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
      {phase === 'collecting-upfront' && (
        <CollectingUpfrontProgress
          collectedCount={(data.collectedCount as number) ?? 0}
          totalRequired={(data.totalRequired as number) ?? 0}
          playersDone={(data.playersDone as number) ?? 0}
          totalPlayers={(data.totalPlayers as number) ?? 0}
          timeRemaining={timeRemaining}
        />
      )}

      {(phase === 'showing-question' ||
        phase === 'subject-picking' ||
        phase === 'guessing') &&
        currentQuestionText && (
          <QuestionCard
            questionText={currentQuestionText}
            questionIndex={roundIndex}
            totalQuestions={totalRounds}
            timeRemaining={timeRemaining}
            phaseLabel={phaseLabel}
          />
        )}

      {phase === 'showing-question' && currentSubjectName && (
        <p
          style={{
            fontSize: '1.2rem',
            color: 'var(--text-secondary)',
            margin: 0,
            textAlign: 'center',
          }}
        >
          Pitanje za{' '}
          <strong style={{ color: 'var(--accent)' }}>
            {currentSubjectName}
          </strong>
        </p>
      )}

      {phase === 'subject-picking' && currentSubjectName && (
        <SubjectPickingDisplay
          subjectName={currentSubjectName}
          options={(data.options as KoSamJaPublicOption[] | undefined) ?? []}
        />
      )}

      {phase === 'guessing' && (
        <GuessingDisplay
          options={(data.options as KoSamJaPublicOption[] | undefined) ?? []}
          guessedCount={(data.guessedCount as number) ?? 0}
          totalGuessers={(data.totalGuessers as number) ?? 0}
        />
      )}

      {phase === 'showing-results' && data.results != null && (
        <>
          <ResultsReveal results={data.results as KoSamJaResultData} />
          {data.leaderboard != null && (
            <Leaderboard
              entries={data.leaderboard as KoSamJaLeaderboardEntry[]}
              isFinal={roundIndex === totalRounds - 1}
            />
          )}
        </>
      )}

      {phase === 'ended' && data.leaderboard != null && (
        <Leaderboard
          entries={data.leaderboard as KoSamJaLeaderboardEntry[]}
          isFinal={true}
        />
      )}
    </div>
  );
}
