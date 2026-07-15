import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';
import { QuestionDisplay } from './components/QuestionDisplay';
import { OptionGrid } from './components/OptionGrid';
import { AnswerCounter } from './components/AnswerCounter';
import { WaitingChips } from '../../components/WaitingChips';
import { Leaderboard } from './components/Leaderboard';
import { GeoMap } from './components/GeoMap';
import { BrojTimeline } from './components/BrojTimeline';
import { MediaPanel } from './components/MediaPanel';
import { formatBrojValue } from '@igra/shared';
import type {
  KvizBrojRoundResult,
  KvizGeoRoundResult,
  KvizQuestionType,
  KvizValueType,
  KvizVideoRef,
  QuizLeaderboardEntry,
  QuizOption,
  QuizResultData,
} from '@igra/shared';

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
  const questionType = (data.questionType as KvizQuestionType) ?? 'obicno';
  const questionText = data.questionText as string | undefined;
  const imageUrl = data.imageUrl as string | undefined;
  const options = data.options as QuizOption[] | undefined;
  const timeLimit = (data.timeLimit as number) || 15;
  const previewDuration = (data.previewDuration as number) || 5;

  // Pack still loading from disk — brief "get ready" beat.
  if (data.loading) {
    return (
      <Center>
        <motion.p
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '2rem', fontWeight: 700 }}
        >
          Spremi se...
        </motion.p>
      </Center>
    );
  }

  // Audio/video questions keep one component identity across the
  // showing-question → answering flip so the media doesn't restart.
  if (
    (questionType === 'audio' || questionType === 'video') &&
    (phase === 'showing-question' || phase === 'answering') &&
    questionText
  ) {
    return (
      <Column>
        <QuestionDisplay
          questionText={questionText}
          questionIndex={questionIndex}
          totalQuestions={totalQuestions}
          timeRemaining={timeRemaining}
          timeLimit={phase === 'answering' ? timeLimit : previewDuration}
          imageUrl={imageUrl}
        />
        <MediaPanel
          key={questionIndex}
          audioUrl={data.audioUrl as string | undefined}
          video={data.video as KvizVideoRef | undefined}
          compact={phase === 'answering'}
        />
        {phase === 'showing-question' && (
          <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
            Spremi se...
          </p>
        )}
        {phase === 'answering' && options && (
          <>
            <OptionGrid options={options} showResults={false} />
            <AnswerCounter
              answeredCount={data.answeredCount as number}
              totalPlayers={data.totalPlayers as number}
            />
            <WaitingChips
              expectedIds={(data.expectedIds as string[]) ?? []}
              answeredIds={(data.answeredIds as string[]) ?? []}
            />
          </>
        )}
      </Column>
    );
  }

  if (
    questionType === 'geo' &&
    (phase === 'showing-question' || phase === 'answering') &&
    imageUrl
  ) {
    return (
      <GeoPromptScreen
        phase={phase}
        imageUrl={imageUrl}
        questionText={questionText ?? 'Gde je ovo slikano?'}
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        timeRemaining={timeRemaining}
        answeredCount={(data.answeredCount as number) ?? 0}
        totalPlayers={(data.totalPlayers as number) ?? 0}
      />
    );
  }

  if (
    questionType === 'broj' &&
    (phase === 'showing-question' || phase === 'answering') &&
    questionText
  ) {
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Pitanje {questionIndex + 1}/{totalQuestions}
        </p>
        <motion.p
          key={questionText}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            fontSize: '3rem',
            fontWeight: 800,
            textAlign: 'center',
            maxWidth: '1000px',
            lineHeight: 1.2,
          }}
        >
          {data.emoji ? `${data.emoji} ` : ''}
          {questionText}
        </motion.p>
        {imageUrl && (
          <motion.img
            key={imageUrl}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            src={imageUrl}
            alt=""
            style={{
              maxWidth: 'min(90%, 720px)',
              maxHeight: '46vh',
              objectFit: 'contain',
              borderRadius: '1rem',
            }}
          />
        )}
        {phase === 'showing-question' ? (
          <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
            Spremi se...
          </p>
        ) : (
          <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
            Pomeri klizač na telefonu · {(data.answeredCount as number) ?? 0}/
            {(data.totalPlayers as number) ?? 0} · {timeRemaining}s
          </p>
        )}
      </Center>
    );
  }

  return (
    <Column>
      {phase === 'showing-question' && questionText && (
        <>
          <QuestionDisplay
            questionText={questionText}
            questionIndex={questionIndex}
            totalQuestions={totalQuestions}
            timeRemaining={timeRemaining}
            timeLimit={previewDuration}
            imageUrl={imageUrl}
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
            imageUrl={imageUrl}
          />
          <OptionGrid options={options} showResults={false} />
          <AnswerCounter
            answeredCount={data.answeredCount as number}
            totalPlayers={data.totalPlayers as number}
          />
          <WaitingChips
            expectedIds={(data.expectedIds as string[]) ?? []}
            answeredIds={(data.answeredIds as string[]) ?? []}
          />
        </>
      )}

      {phase === 'showing-results' && data.geoResult != null && (
        <GeoResults result={data.geoResult as KvizGeoRoundResult} />
      )}

      {phase === 'showing-results' && data.brojResult != null && (
        <BrojResults result={data.brojResult as KvizBrojRoundResult} />
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
    </Column>
  );
}

function Column({ children }: { children: React.ReactNode }) {
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
      {children}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1rem',
        padding: '1.5rem',
      }}
    >
      {children}
    </div>
  );
}

// Photo-focused layout for geo questions: photo fills the screen while the
// pins go down on the phones (map on the TV only at results).
function GeoPromptScreen({
  phase,
  imageUrl,
  questionText,
  questionIndex,
  totalQuestions,
  timeRemaining,
  answeredCount,
  totalPlayers,
}: {
  phase: string;
  imageUrl: string;
  questionText: string;
  questionIndex: number;
  totalQuestions: number;
  timeRemaining: number;
  answeredCount: number;
  totalPlayers: number;
}) {
  const lowTime = phase === 'answering' && timeRemaining <= 5;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '2rem',
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
          minHeight: '2rem',
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span>
          Pitanje <strong>{questionIndex + 1}</strong> / {totalQuestions} · {questionText}
        </span>
        <span
          style={{
            fontWeight: 700,
            color: lowTime ? 'var(--danger)' : 'var(--text-primary)',
            fontSize: lowTime ? '1.6rem' : '1.2rem',
          }}
        >
          {timeRemaining}s
        </span>
        {phase === 'answering' && (
          <span style={{ color: 'var(--text-secondary)' }}>
            Zaključano: <strong>{answeredCount}</strong> / {totalPlayers}
          </span>
        )}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '1rem 0',
        }}
      >
        <img
          src={imageUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            borderRadius: '0.5rem',
          }}
        />
      </div>
      <p
        style={{
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '1rem',
          margin: 0,
          minHeight: '1.5rem',
        }}
      >
        {phase === 'answering'
          ? 'Tapni mapu na svom telefonu da postaviš iglu.'
          : 'Spremi se...'}
      </p>
    </div>
  );
}

function GeoResults({ result }: { result: KvizGeoRoundResult }) {
  const players = useRoomStore((s) => s.players);
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';
  const scored = result.results.filter((r) => r.pin !== null);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.8rem',
        width: '100%',
        height: '100%',
      }}
    >
      <motion.h2
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ fontSize: '2rem', textAlign: 'center', margin: 0 }}
      >
        {result.caption ?? 'Otkriva se...'}
      </motion.h2>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <GeoMap
          pins={scored.map((r) => ({
            playerId: r.playerId,
            name: r.name,
            color: r.avatarColor,
            pin: r.pin!,
          }))}
          truePin={result.truePin}
          showLines
          maxHeightCss="calc(100dvh - 300px)"
          maxWidthCss="80vw"
          mapImageUrl={result.mapImageUrl}
        />
      </div>
      {scored.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'center',
            maxWidth: '1000px',
            flexShrink: 0,
          }}
        >
          {scored.map((r) => (
            <div
              key={r.playerId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.4rem 0.8rem',
                background: 'var(--bg-card)',
                borderRadius: '0.7rem',
                borderLeft: `5px solid ${r.avatarColor}`,
                fontSize: '1rem',
              }}
            >
              <span style={{ fontWeight: 700 }}>
                {emojiFor(r.playerId)} {r.name}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {r.distanceKm === null
                  ? '—'
                  : r.distanceKm < 1
                    ? `${Math.round(r.distanceKm * 1000)} m`
                    : `${r.distanceKm.toFixed(1)} km`}
              </span>
              <span style={{ fontWeight: 800, color: 'var(--accent)' }}>
                +{r.roundScore}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrojResults({ result }: { result: KvizBrojRoundResult }) {
  const players = useRoomStore((s) => s.players);
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';
  const fmt = (v: number) =>
    formatBrojValue(v, result.unit, result.valueType as KvizValueType | undefined);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        width: '100%',
        overflowY: 'auto',
      }}
    >
      <motion.p
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ fontSize: '3.2rem', fontWeight: 800, color: 'var(--accent)', margin: 0 }}
      >
        {fmt(result.trueValue)}
      </motion.p>

      <BrojTimeline
        min={result.min}
        max={result.max}
        trueValue={result.trueValue}
        results={result.results}
        unit={result.unit}
        valueType={result.valueType}
      />

      <div style={{ width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {result.results.map((r) => (
          <div
            key={r.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.4rem 0.7rem',
              background: 'var(--bg-secondary)',
              borderRadius: '0.5rem',
              borderLeft: `5px solid ${r.avatarColor}`,
            }}
          >
            <span style={{ flex: 1, fontWeight: 600 }}>
              {emojiFor(r.playerId)} {r.name}
            </span>
            <span style={{ color: 'var(--text-secondary)', minWidth: '4.5rem', textAlign: 'right' }}>
              {r.guess != null ? fmt(r.guess) : '—'}
            </span>
            <span style={{ color: 'var(--text-secondary)', minWidth: '4.5rem', textAlign: 'right', fontSize: '0.85rem' }}>
              {r.distance === null ? '' : `±${fmt(r.distance)}`}
            </span>
            <span
              style={{
                fontWeight: 800,
                minWidth: '3.5rem',
                textAlign: 'right',
                color: r.roundScore > 0 ? '#7be37b' : 'var(--text-secondary)',
              }}
            >
              +{r.roundScore}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Reveals the answer in-place: same question header + option grid as the
// answering phase, just with the correct option flagged and per-option vote
// counts.
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
        imageUrl={question.imageUrl}
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
                <span style={{ fontWeight: 600 }}>
                  {player?.avatarEmoji} {player?.name}
                </span>{' '}
                <span style={{ color: 'var(--success)' }}>+{s.roundScore}</span>
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
}
