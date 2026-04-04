interface QuestionCardProps {
  questionText: string;
  questionIndex: number;
  totalQuestions: number;
  timeRemaining: number;
  phaseLabel?: string;
}

export function QuestionCard({
  questionText,
  questionIndex,
  totalQuestions,
  timeRemaining,
  phaseLabel,
}: QuestionCardProps) {
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
            color: timeRemaining <= 5 ? 'var(--danger)' : 'var(--accent)',
            minWidth: '3ch',
            textAlign: 'right',
          }}
        >
          {timeRemaining}s
        </span>
      </div>
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
