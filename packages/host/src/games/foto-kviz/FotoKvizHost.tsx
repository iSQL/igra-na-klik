import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  FotoKvizHostData,
  FotoKvizPlayerAnswerSummary,
  FotoKvizPublicQuestion,
  FotoKvizRoundResult,
  GeoLeaderboardEntry,
  GeoSubmissionProgress,
  QuizOption,
} from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';

export default function FotoKvizHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTimeRef = useRef<number>(Infinity);

  useEffect(() => {
    if (!gameState) return;
    const { phase, timeRemaining } = gameState;

    if (phase !== prevPhaseRef.current) {
      if (phase === 'showing-results') play('reveal');
      if (phase === 'final-leaderboard') play('victory');
      prevPhaseRef.current = phase;
    }

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
  const host = data.host as FotoKvizHostData | undefined;
  if (!host) return null;

  if (phase === 'submission') {
    return (
      <SubmissionScreen
        progress={host.submissionProgress ?? []}
        photosPerPlayer={host.customPhotosPerPlayer ?? 0}
      />
    );
  }

  if (phase === 'intro') {
    return (
      <IntroScreen
        packName={host.packName ?? '...'}
        totalRounds={host.totalRounds}
      />
    );
  }

  if (phase === 'showing-photo' && host.currentRound) {
    return (
      <PhotoLayout
        question={host.currentRound.question}
        roundNumber={host.currentRound.index + 1}
        totalRounds={host.currentRound.total}
        timeRemaining={timeRemaining}
        showOptions={false}
        footer={`Spremi se: ${timeRemaining}s`}
      />
    );
  }

  if (phase === 'answering' && host.currentRound) {
    const lowTime = timeRemaining <= 5;
    return (
      <PhotoLayout
        question={host.currentRound.question}
        roundNumber={host.currentRound.index + 1}
        totalRounds={host.currentRound.total}
        timeRemaining={timeRemaining}
        showOptions
        footer={`Odgovorilo: ${host.answeredCount ?? 0} / ${host.totalPlayers ?? 0}`}
        timerHighlight={lowTime}
      />
    );
  }

  if (phase === 'showing-results' && host.currentRound && host.roundResult) {
    return (
      <ResultsLayout
        question={host.currentRound.question}
        roundNumber={host.currentRound.index + 1}
        totalRounds={host.currentRound.total}
        result={host.roundResult}
      />
    );
  }

  if (phase === 'final-leaderboard') {
    return <FinalLeaderboard entries={host.finalLeaderboard ?? []} />;
  }

  if (phase === 'ended') {
    return <Centered>Hvala na igri!</Centered>;
  }

  return <Centered>Učitavanje...</Centered>;
}

// ============================================================================
// Sub-screens
// ============================================================================

function SubmissionScreen({
  progress,
  photosPerPlayer,
}: {
  progress: GeoSubmissionProgress[];
  photosPerPlayer: number;
}) {
  const allDone =
    progress.length > 0 && progress.every((p) => p.submitted >= p.total);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem',
        padding: '2rem',
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      <h1 style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: 0 }}>
        Slanje slika
      </h1>
      <p
        style={{
          fontSize: '1.1rem',
          color: 'var(--text-secondary)',
          textAlign: 'center',
        }}
      >
        Svaki igrač šalje {photosPerPlayer} {photosPerPlayer === 1 ? 'sliku' : 'slike'}
        {' '}sa svog telefona i upisuje opis lokacije.
      </p>
      {allDone && (
        <p style={{ color: '#7be37b', fontSize: '1.2rem', fontWeight: 700 }}>
          Sve slike poslate — počinjemo!
        </p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1rem',
          width: '100%',
        }}
      >
        {progress.map((p) => {
          const pct = p.total === 0 ? 0 : (p.submitted / p.total) * 100;
          const done = p.submitted >= p.total;
          return (
            <div
              key={p.playerId}
              style={{
                background: 'var(--bg-card)',
                borderRadius: '0.75rem',
                padding: '0.9rem 1rem',
                borderLeft: `6px solid ${p.avatarColor}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <strong>{p.name}</strong>
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: done ? '#7be37b' : 'var(--text-secondary)',
                  }}
                >
                  {p.submitted}/{p.total}
                </span>
              </div>
              <div
                style={{
                  height: '6px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: done ? '#7be37b' : p.avatarColor,
                    transition: 'width 0.3s',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IntroScreen({
  packName,
  totalRounds,
}: {
  packName: string;
  totalRounds: number;
}) {
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
      <motion.h1
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        style={{ fontSize: '3rem', textAlign: 'center' }}
      >
        Foto kviz
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        style={{ fontSize: '1.4rem', color: 'var(--accent)' }}
      >
        {packName}
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}
      >
        {totalRounds} {totalRounds === 1 ? 'runda' : 'runde'}
      </motion.p>
    </div>
  );
}

function PhotoLayout({
  question,
  roundNumber,
  totalRounds,
  timeRemaining,
  showOptions,
  footer,
  timerHighlight,
}: {
  question: FotoKvizPublicQuestion;
  roundNumber: number;
  totalRounds: number;
  timeRemaining: number;
  showOptions: boolean;
  footer: string;
  timerHighlight?: boolean;
}) {
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
          Runda <strong>{roundNumber}</strong> / {totalRounds}
        </span>
        <span
          style={{
            fontWeight: 700,
            color: timerHighlight ? '#e74c3c' : 'var(--text-primary)',
            fontSize: timerHighlight ? '1.6rem' : '1.2rem',
          }}
        >
          {timeRemaining}s
        </span>
        <span>{footer}</span>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '0.75rem 0',
          gap: '1rem',
          flexDirection: showOptions ? 'column' : 'row',
        }}
      >
        <img
          src={question.imageUrl}
          alt=""
          style={{
            width: '100%',
            height: showOptions ? 'auto' : '100%',
            maxHeight: showOptions ? '60%' : '100%',
            objectFit: 'contain',
            borderRadius: '0.5rem',
          }}
        />
        {showOptions && (
          <OptionGrid options={question.options} />
        )}
      </div>
    </div>
  );
}

function OptionGrid({
  options,
  correctIndex,
  perPlayer,
}: {
  options: QuizOption[];
  correctIndex?: number;
  perPlayer?: FotoKvizPlayerAnswerSummary[];
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '0.75rem',
        width: '100%',
        maxWidth: '1100px',
      }}
    >
      {options.map((opt) => {
        const isCorrect = correctIndex !== undefined && opt.index === correctIndex;
        const isWrong = correctIndex !== undefined && !isCorrect;
        const pickedBy = perPlayer?.filter(
          (p) => p.optionIndex === opt.index
        ) ?? [];
        return (
          <div
            key={opt.index}
            style={{
              padding: '0.9rem 1.1rem',
              borderRadius: '12px',
              background: opt.color,
              color: '#fff',
              fontSize: '1.2rem',
              fontWeight: 700,
              minHeight: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              opacity: isWrong ? 0.45 : 1,
              outline: isCorrect ? '3px solid #7be37b' : 'none',
              outlineOffset: isCorrect ? '2px' : '0',
              boxShadow: isCorrect ? '0 0 16px rgba(123, 227, 123, 0.6)' : 'none',
            }}
          >
            <span>
              {isCorrect && '✓ '}
              {opt.text}
            </span>
            {pickedBy.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {pickedBy.map((p) => (
                  <span
                    key={p.playerId}
                    title={p.name}
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      background: p.avatarColor,
                      boxShadow: '0 0 0 2px rgba(255,255,255,0.7)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResultsLayout({
  question,
  roundNumber,
  totalRounds,
  result,
}: {
  question: FotoKvizPublicQuestion;
  roundNumber: number;
  totalRounds: number;
  result: FotoKvizRoundResult;
}) {
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
          Runda <strong>{roundNumber}</strong> / {totalRounds}
        </span>
        <span style={{ fontWeight: 700, color: '#7be37b' }}>
          Tačan odgovor: {result.question.options[result.question.correctIndex].text}
        </span>
        <span />
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '0.75rem 0',
          gap: '1rem',
          flexDirection: 'column',
        }}
      >
        <img
          src={question.imageUrl}
          alt=""
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: '55%',
            objectFit: 'contain',
            borderRadius: '0.5rem',
          }}
        />
        <OptionGrid
          options={question.options}
          correctIndex={result.question.correctIndex}
          perPlayer={result.perPlayer}
        />
      </div>
    </div>
  );
}

function FinalLeaderboard({ entries }: { entries: GeoLeaderboardEntry[] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.2rem',
        padding: '2rem',
      }}
    >
      <motion.h1
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ fontSize: '2.6rem' }}
      >
        Konačna tabela
      </motion.h1>
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
        }}
      >
        <AnimatePresence>
          {entries.map((entry, i) => (
            <motion.div
              key={entry.playerId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.85rem 1.1rem',
                background: 'var(--bg-card)',
                borderRadius: '0.75rem',
                borderLeft: `8px solid ${entry.avatarColor}`,
                fontSize: '1.2rem',
              }}
            >
              <span
                style={{
                  width: '2rem',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: '1.4rem',
                }}
              >
                {entry.rank === 1
                  ? '🥇'
                  : entry.rank === 2
                  ? '🥈'
                  : entry.rank === 3
                  ? '🥉'
                  : `#${entry.rank}`}
              </span>
              <span style={{ flex: 1, fontWeight: 600 }}>{entry.name}</span>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                {entry.score.toLocaleString('sr-Latn-RS')}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        fontSize: '1.4rem',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </div>
  );
}
