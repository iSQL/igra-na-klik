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
import { PixelatedImage } from './components/PixelatedImage';
import { formatBrojValue } from '@igra/shared';
import type {
  KvizBrojRoundResult,
  KvizEmojiRoundResult,
  KvizGeoRoundResult,
  KvizQuestionType,
  KvizRedosledRoundResult,
  KvizTextRoundResult,
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
    questionType === 'emoji' &&
    (phase === 'showing-question' || phase === 'answering')
  ) {
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Pitanje {questionIndex + 1}/{totalQuestions} ·{' '}
          {questionText ?? 'Šta se krije iza emojija?'}
        </p>
        <motion.p
          key={`${questionIndex}-${data.emojis as string}`}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            fontSize: 'clamp(4rem, 12vw, 8rem)',
            lineHeight: 1.2,
            textAlign: 'center',
            margin: 0,
          }}
        >
          {data.emojis as string}
        </motion.p>
        {phase === 'showing-question' ? (
          <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
            Spremi se...
          </p>
        ) : (
          <>
            {typeof data.hint === 'string' && data.hint.length > 0 && (
              <p
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  color: 'var(--accent)',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {data.hint as string}
              </p>
            )}
            <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
              Kucaj odgovor na telefonu · {(data.answeredCount as number) ?? 0}/
              {(data.totalPlayers as number) ?? 0} · {timeRemaining}s
            </p>
            <WaitingChips
              expectedIds={(data.expectedIds as string[]) ?? []}
              answeredIds={(data.answeredIds as string[]) ?? []}
            />
          </>
        )}
      </Center>
    );
  }

  if (
    questionType === 'dopuna' &&
    (phase === 'showing-question' || phase === 'answering')
  ) {
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Pitanje {questionIndex + 1}/{totalQuestions} ·{' '}
          {questionText ?? 'Završi citat!'}
        </p>
        <motion.p
          key={`${questionIndex}-quote`}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="display"
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 3rem)',
            fontWeight: 700,
            textAlign: 'center',
            maxWidth: '1000px',
            lineHeight: 1.3,
            margin: 0,
          }}
        >
          „{data.quote as string}{' '}
          <span style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}>
            ______
          </span>
          "
        </motion.p>
        {phase === 'showing-question' ? (
          <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
            Spremi se...
          </p>
        ) : (
          <>
            <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
              Kucaj reč koja nedostaje na telefonu ·{' '}
              {(data.answeredCount as number) ?? 0}/
              {(data.totalPlayers as number) ?? 0} · {timeRemaining}s
            </p>
            <WaitingChips
              expectedIds={(data.expectedIds as string[]) ?? []}
              answeredIds={(data.answeredIds as string[]) ?? []}
            />
          </>
        )}
      </Center>
    );
  }

  if (
    questionType === 'piksel' &&
    (phase === 'showing-question' || phase === 'answering') &&
    imageUrl
  ) {
    // Sharpens as the clock runs down; preview stays fully pixelated.
    const pixelation =
      phase === 'showing-question'
        ? 1
        : Math.max(0, Math.min(1, timeRemaining / timeLimit));
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Pitanje {questionIndex + 1}/{totalQuestions} ·{' '}
          {questionText ?? 'Šta je na slici?'}
        </p>
        <PixelatedImage src={imageUrl} pixelation={pixelation} />
        {phase === 'showing-question' ? (
          <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
            Spremi se...
          </p>
        ) : (
          <>
            <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
              Slika se izoštrava — kucaj odgovor na telefonu ·{' '}
              {(data.answeredCount as number) ?? 0}/
              {(data.totalPlayers as number) ?? 0} · {timeRemaining}s
            </p>
            <WaitingChips
              expectedIds={(data.expectedIds as string[]) ?? []}
              answeredIds={(data.answeredIds as string[]) ?? []}
            />
          </>
        )}
      </Center>
    );
  }

  if (
    questionType === 'anagram' &&
    (phase === 'showing-question' || phase === 'answering')
  ) {
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Pitanje {questionIndex + 1}/{totalQuestions} ·{' '}
          {questionText ?? 'Reši anagram!'}
        </p>
        {phase === 'showing-question' ? (
          <>
            <p style={{ fontSize: '5rem', lineHeight: 1, margin: 0 }}>🔀</p>
            <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
              Spremi se...
            </p>
          </>
        ) : (
          <>
            <motion.p
              key={data.scramble as string}
              initial={{ opacity: 0.4, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                fontSize: 'clamp(2.4rem, 7vw, 5rem)',
                fontWeight: 800,
                letterSpacing: '0.18em',
                fontFamily: 'monospace',
                color: 'var(--accent)',
                textAlign: 'center',
                margin: 0,
                whiteSpace: 'pre-wrap',
              }}
            >
              {(data.scramble as string) ?? ''}
            </motion.p>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
              Slova se polako preslažu — što pre pogodiš, više poena!
            </p>
            <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
              {(data.answeredCount as number) ?? 0}/
              {(data.totalPlayers as number) ?? 0} · {timeRemaining}s
            </p>
            <WaitingChips
              expectedIds={(data.expectedIds as string[]) ?? []}
              answeredIds={(data.answeredIds as string[]) ?? []}
            />
          </>
        )}
      </Center>
    );
  }

  if (
    questionType === 'redosled' &&
    (phase === 'showing-question' || phase === 'answering')
  ) {
    const items = (data.items as string[]) ?? [];
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Pitanje {questionIndex + 1}/{totalQuestions}
        </p>
        <p
          className="display"
          style={{
            fontSize: '2.2rem',
            fontWeight: 800,
            textAlign: 'center',
            maxWidth: '1000px',
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {questionText}
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'center',
            maxWidth: '900px',
          }}
        >
          {items.map((it, i) => (
            <motion.span
              key={`${i}-${it}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                padding: '0.5rem 0.9rem',
                background: 'var(--bg-card)',
                borderRadius: '0.7rem',
                fontSize: '1.15rem',
                fontWeight: 700,
                border: '1px solid var(--line2, rgba(255,255,255,.12))',
              }}
            >
              {it}
            </motion.span>
          ))}
        </div>
        {phase === 'showing-question' ? (
          <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
            Spremi se...
          </p>
        ) : (
          <>
            <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
              Poređaj pojmove na telefonu ·{' '}
              {(data.answeredCount as number) ?? 0}/
              {(data.totalPlayers as number) ?? 0} · {timeRemaining}s
            </p>
            <WaitingChips
              expectedIds={(data.expectedIds as string[]) ?? []}
              answeredIds={(data.answeredIds as string[]) ?? []}
            />
          </>
        )}
      </Center>
    );
  }

  if (
    questionType === 'geo' &&
    (phase === 'showing-question' || phase === 'answering')
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

      {phase === 'showing-results' && data.emojiResult != null && (
        <EmojiResults result={data.emojiResult as KvizEmojiRoundResult} />
      )}

      {phase === 'showing-results' && data.textResult != null && (
        <TextResults result={data.textResult as KvizTextRoundResult} />
      )}

      {phase === 'showing-results' && data.redosledResult != null && (
        <RedosledResults result={data.redosledResult as KvizRedosledRoundResult} />
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
  imageUrl?: string;
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
          Pitanje <strong>{questionIndex + 1}</strong> / {totalQuestions}
          {imageUrl ? ` · ${questionText}` : ''}
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
        {imageUrl ? (
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
        ) : (
          // Text-only geo question: the prompt itself is the focus (no photo).
          <motion.p
            key={questionText}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{
              fontSize: '3.4rem',
              fontWeight: 800,
              textAlign: 'center',
              maxWidth: '1000px',
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            {questionText}
          </motion.p>
        )}
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

function EmojiResults({ result }: { result: KvizEmojiRoundResult }) {
  const players = useRoomStore((s) => s.players);
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';

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
      <p style={{ fontSize: '3rem', margin: 0 }}>{result.emojis}</p>
      <motion.p
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{
          fontSize: '2.6rem',
          fontWeight: 800,
          color: 'var(--accent)',
          margin: 0,
          textAlign: 'center',
        }}
      >
        {result.answer}
      </motion.p>

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
            <span style={{ color: 'var(--text-secondary)', minWidth: '4.5rem', textAlign: 'right', fontSize: '0.9rem' }}>
              {r.solved
                ? r.timeMs != null
                  ? `${(r.timeMs / 1000).toFixed(1)}s`
                  : '✓'
                : '—'}
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

// Results for the free-text types dopuna/piksel/anagram — the reveal visual
// depends on the kind (finished quote / sharp image / solved word).
function TextResults({ result }: { result: KvizTextRoundResult }) {
  const players = useRoomStore((s) => s.players);
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';

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
      {result.kind === 'dopuna' && result.quote && (
        <p
          className="display"
          style={{
            fontSize: '1.8rem',
            fontWeight: 700,
            textAlign: 'center',
            maxWidth: '1000px',
            lineHeight: 1.3,
            margin: 0,
          }}
        >
          „{result.quote}{' '}
          <span style={{ color: 'var(--accent)' }}>{result.answer}</span>"
        </p>
      )}
      {result.kind === 'piksel' && result.imageUrl && (
        <img
          src={result.imageUrl}
          alt=""
          style={{
            maxWidth: 'min(80%, 640px)',
            maxHeight: '40vh',
            objectFit: 'contain',
            borderRadius: '0.8rem',
          }}
        />
      )}
      {result.kind !== 'dopuna' && (
        <motion.p
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            fontSize: '2.6rem',
            fontWeight: 800,
            color: 'var(--accent)',
            margin: 0,
            textAlign: 'center',
          }}
        >
          {result.answer}
        </motion.p>
      )}

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
            <span style={{ color: 'var(--text-secondary)', minWidth: '4.5rem', textAlign: 'right', fontSize: '0.9rem' }}>
              {r.solved
                ? r.timeMs != null
                  ? `${(r.timeMs / 1000).toFixed(1)}s`
                  : '✓'
                : '—'}
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

// Results for redosled questions: the correct sequence + per-player accuracy.
function RedosledResults({ result }: { result: KvizRedosledRoundResult }) {
  const players = useRoomStore((s) => s.players);
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';

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
      <p
        className="display"
        style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, textAlign: 'center' }}
      >
        {result.text}
      </p>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.3rem',
          maxWidth: '640px',
          width: '100%',
        }}
      >
        {result.correctItems.map((it, i) => (
          <motion.div
            key={`${i}-${it}`}
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.18 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.4rem 0.7rem',
              background: 'var(--bg-card)',
              borderRadius: '0.5rem',
              fontSize: '1.05rem',
              fontWeight: 700,
            }}
          >
            <span style={{ color: 'var(--accent)', minWidth: '2ch', fontWeight: 800 }}>
              {i + 1}.
            </span>
            <span>{it}</span>
          </motion.div>
        ))}
      </div>

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
            <span style={{ color: 'var(--text-secondary)', minWidth: '4.5rem', textAlign: 'right', fontSize: '0.9rem' }}>
              {r.accuracy === null ? '—' : `${r.accuracy}% parova`}
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
