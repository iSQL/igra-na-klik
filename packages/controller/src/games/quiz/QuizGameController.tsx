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

  const { phase, timeRemaining, data, playerData } = gameState;
  const myData = playerData[playerId] as
    | { hasAnswered: boolean; selectedIndex: number | null }
    | undefined;

  if (phase === 'showing-question') {
    const questionText = data.questionText as string | undefined;
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
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
          Pitanje {(data.questionIndex as number) + 1}/{data.totalQuestions as number}
        </p>
        {questionText && (
          <p style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.3, margin: 0 }}>
            {questionText}
          </p>
        )}
        <CountdownRing timeRemaining={timeRemaining} duration={previewDuration} />
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          Odgovori se pojavljuju za...
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
