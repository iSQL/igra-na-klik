import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';
import { QuestionDisplay } from './components/QuestionDisplay';
import { OptionGrid } from './components/OptionGrid';
import { AnswerCounter } from './components/AnswerCounter';
import { Leaderboard } from './components/Leaderboard';
import type { QuizOption, QuizResultData, QuizLeaderboardEntry } from '@igra/shared';

// Mirrors SHOWING_RESULTS_DURATION in QuizGameModule — used only to drive
// the countdown ring; if they drift the visual just looks slightly off.
const SHOWING_RESULTS_DURATION = 5;

export default function QuizGameHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTimeRef = useRef<number>(Infinity);

  useEffect(() => {
    if (!gameState) return;
    const { phase, timeRemaining } = gameState;

    // Sound on phase transition
    if (phase !== prevPhaseRef.current) {
      if (phase === 'showing-results') play('reveal');
      if (phase === 'ended') play('victory');
      prevPhaseRef.current = phase;
    }

    // Tick sound during answering countdown (≤5s)
    if (phase === 'answering') {
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
  const questionText = data.questionText as string | undefined;
  const options = data.options as QuizOption[] | undefined;
  const timeLimit = (data.timeLimit as number) || 15;
  const previewDuration = (data.previewDuration as number) || 5;

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
            timeLimit={previewDuration}
          />
          <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
            Spremi se...
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
        <ResultsInPlace
          results={data.results as QuizResultData}
          questionIndex={questionIndex}
          totalQuestions={totalQuestions}
          timeRemaining={timeRemaining}
        />
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

// Reveals the answer in-place: same question header + option grid as the
// answering phase, just with the correct option flagged and per-option vote
// counts. Replaces the old separate bar-chart screen so the visual context
// carries over between phases (like Pogodi gde je's reveal step).
function ResultsInPlace({
  results,
  questionIndex,
  totalQuestions,
  timeRemaining,
}: {
  results: QuizResultData;
  questionIndex: number;
  totalQuestions: number;
  timeRemaining: number;
}) {
  const players = useRoomStore((s) => s.players);
  const { question, answers, scores } = results;

  const counts = question.options.map(
    (opt) => answers.filter((a) => a.optionIndex === opt.index).length
  );

  const pickersByOption = question.options.map((opt) =>
    answers
      .filter((a) => a.optionIndex === opt.index)
      .map((a) => {
        const p = players.find((pl) => pl.id === a.playerId);
        return {
          playerId: a.playerId,
          name: p?.name ?? '',
          avatarColor: p?.avatarColor ?? '#666',
        };
      })
  );

  const roundScorers = scores
    .filter((s) => s.roundScore > 0)
    .sort((a, b) => b.roundScore - a.roundScore);

  return (
    <>
      <QuestionDisplay
        questionText={question.text}
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        timeRemaining={timeRemaining}
        timeLimit={SHOWING_RESULTS_DURATION}
      />
      <OptionGrid
        options={question.options}
        showResults={true}
        correctIndex={question.correctIndex}
        counts={counts}
        pickersByOption={pickersByOption}
      />
      {roundScorers.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'center',
            maxWidth: '700px',
          }}
        >
          {roundScorers.map((s) => {
            const player = players.find((p) => p.id === s.playerId);
            return (
              <motion.div
                key={s.playerId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: '0.5rem',
                  padding: '0.4rem 0.8rem',
                  borderLeft: `3px solid ${player?.avatarColor || '#666'}`,
                }}
              >
                <span style={{ fontWeight: 600 }}>{player?.name}</span>{' '}
                <span style={{ color: 'var(--success)' }}>+{s.roundScore}</span>
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}
