import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { AnswerButtons } from './components/AnswerButtons';
import { WaitingForResults } from './components/WaitingForResults';
import { RoundResult } from './components/RoundResult';
import type { QuizOption, QuizResultData, QuizLeaderboardEntry } from '@igra/shared';

export default function QuizGameController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const myData = playerData[playerId] as
    | { hasAnswered: boolean; selectedIndex: number | null }
    | undefined;

  if (phase === 'showing-question') {
    const questionText = data.questionText as string | undefined;
    const imageUrl = data.imageUrl as string | undefined;
    const previewDuration = (data.previewDuration as number) || 5;
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
        <p
          style={{
            fontSize: '0.8rem',
            fontWeight: 800,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            margin: 0,
          }}
        >
          Pitanje {(data.questionIndex as number) + 1}/{data.totalQuestions as number}
        </p>
        {questionText && (
          <p
            className="display card"
            style={{
              fontSize: '1.3rem',
              fontWeight: 600,
              lineHeight: 1.25,
              margin: 0,
              padding: '1.1rem 1.2rem',
              borderRadius: '18px',
            }}
          >
            {questionText}
          </p>
        )}
        {imageUrl && <QuestionImage src={imageUrl} />}
        <CountdownRing timeRemaining={timeRemaining} duration={previewDuration} />
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          Odgovori se pojavljuju za...
        </p>
      </div>
    );
  }

  if (phase === 'answering') {
    const options = data.options as QuizOption[];
    const questionText = data.questionText as string | undefined;
    const imageUrl = data.imageUrl as string | undefined;
    const hasAnswered = myData?.hasAnswered ?? false;
    const selectedIndex = myData?.selectedIndex ?? null;

    const body =
      hasAnswered && selectedIndex !== null ? (
        <WaitingForResults
          selectedIndex={selectedIndex}
          optionColor={
            options.find((o) => o.index === selectedIndex)?.color ??
            'var(--accent)'
          }
        />
      ) : (
        <AnswerButtons
          options={options}
          hasAnswered={hasAnswered}
          selectedIndex={selectedIndex}
        />
      );

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: '0.75rem',
          gap: '0.75rem',
        }}
      >
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <p
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: 0,
              marginBottom: '0.35rem',
            }}
          >
            Pitanje {(data.questionIndex as number) + 1}/
            {data.totalQuestions as number}
          </p>
          {questionText && (
            <p
              className="display card"
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                lineHeight: 1.25,
                margin: 0,
                padding: '0.8rem 1rem',
                borderRadius: '16px',
              }}
            >
              {questionText}
            </p>
          )}
          {imageUrl && <QuestionImage src={imageUrl} compact />}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>{body}</div>
      </div>
    );
  }

  if (phase === 'showing-results' && data.results) {
    return <RoundResult results={data.results as QuizResultData} />;
  }

  if ((phase === 'leaderboard' || phase === 'ended') && data.leaderboard) {
    const leaderboard = data.leaderboard as QuizLeaderboardEntry[];
    const myEntry = leaderboard.find((e) => e.playerId === playerId);

    // Hostless room: no TV showing the standings, so render the full
    // leaderboard on the phone instead of just the player's own rank.
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
            <p
              style={{
                fontSize: '0.85rem',
                fontWeight: 800,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {phase === 'ended' ? 'Konačno mesto' : 'Tvoje mesto'}
            </p>
            <p
              className="display text-grad"
              style={{ fontSize: '4rem', fontWeight: 700, animation: 'igra-pop .5s' }}
            >
              #{myEntry.rank}
            </p>
            <p className="display" style={{ fontSize: '1.6rem', fontWeight: 600 }}>
              {myEntry.score.toLocaleString()}{' '}
              <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>poena</span>
            </p>
          </>
        )}
      </div>
    );
  }

  return null;
}

// Question image shown above the answer buttons. `compact` caps the height
// harder during the answering phase so the option grid still fits the screen.
function QuestionImage({ src, compact }: { src: string; compact?: boolean }) {
  return (
    <img
      src={src}
      alt=""
      style={{
        display: 'block',
        margin: '0 auto',
        maxWidth: '100%',
        maxHeight: compact ? '26vh' : '38vh',
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
        borderRadius: '14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
    />
  );
}

function CountdownRing({
  timeRemaining,
  duration,
}: {
  timeRemaining: number;
  duration: number;
}) {
  const progress = duration > 0 ? Math.max(0, Math.min(1, timeRemaining / duration)) : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const isUrgent = timeRemaining <= 2;
  return (
    <svg width="86" height="86" style={{ display: 'block' }}>
      <circle cx="43" cy="43" r={radius} fill="none" stroke="var(--bg-card)" strokeWidth="6" />
      <circle
        cx="43"
        cy="43"
        r={radius}
        fill="none"
        stroke={isUrgent ? 'var(--danger)' : 'var(--accent)'}
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        strokeLinecap="round"
        transform="rotate(-90 43 43)"
        style={{ transition: 'stroke-dashoffset 0.3s linear, stroke 0.3s' }}
      />
      <text
        x="43"
        y="43"
        textAnchor="middle"
        dominantBaseline="central"
        fill={isUrgent ? 'var(--danger)' : 'var(--text-primary)'}
        fontSize="22"
        fontWeight="700"
        fontFamily="monospace"
      >
        {Math.ceil(timeRemaining)}
      </text>
    </svg>
  );
}
