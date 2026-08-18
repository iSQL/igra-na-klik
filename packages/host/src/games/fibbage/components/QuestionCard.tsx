interface QuestionCardProps {
  questionText: string;
  questionIndex: number;
  totalQuestions: number;
  timeRemaining: number;
  phaseLabel?: string;
  /** Full length of the running phase — drives the drain bar. Omit to hide it. */
  phaseDuration?: number;
}

export function QuestionCard({
  questionText,
  questionIndex,
  totalQuestions,
  timeRemaining,
  phaseLabel,
  phaseDuration,
}: QuestionCardProps) {
  const urgent = timeRemaining <= 5;
  const pct =
    phaseDuration && phaseDuration > 0
      ? Math.max(0, Math.min(1, timeRemaining / phaseDuration))
      : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        width: '100%',
        maxWidth: '800px',
        padding: '1.5rem 2rem',
        background: 'var(--bg-card)',
        borderRadius: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span>
          Pitanje {questionIndex + 1}/{totalQuestions}
        </span>
        {phaseLabel && <span>{phaseLabel}</span>}
        <span
          style={{
            fontWeight: 700,
            fontSize: '1.1rem',
            color: urgent ? 'var(--danger)' : 'var(--accent)',
            minWidth: '3ch',
            textAlign: 'right',
          }}
        >
          {timeRemaining}s
        </span>
      </div>

      {/* A bare number reads as decoration across a room; the bar is what
          people actually see from the couch. */}
      {pct !== null && (
        <div
          style={{
            width: '100%',
            height: '6px',
            borderRadius: '999px',
            background: 'var(--bg-secondary)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              background: urgent ? 'var(--danger)' : 'var(--accent)',
              borderRadius: '999px',
              transition: 'width 1s linear, background 0.3s',
            }}
          />
        </div>
      )}

      <p
        style={{
          fontSize: '1.8rem',
          fontWeight: 700,
          textAlign: 'center',
          lineHeight: 1.3,
        }}
      >
        {questionText}
      </p>
    </div>
  );
}
