import { motion } from 'framer-motion';

interface QuestionDisplayProps {
  questionText: string;
  questionIndex: number;
  totalQuestions: number;
  timeRemaining: number;
  timeLimit: number;
  imageUrl?: string;
}

export function QuestionDisplay({
  questionText,
  questionIndex,
  totalQuestions,
  timeRemaining,
  timeLimit,
  imageUrl,
}: QuestionDisplayProps) {
  const progress = timeLimit > 0 ? timeRemaining / timeLimit : 1;
  const circumference = 2 * Math.PI * 45;
  const isUrgent = timeRemaining <= 5;

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
        Pitanje {questionIndex + 1}/{totalQuestions}
      </p>

      <motion.h2
        key={questionText}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: imageUrl ? '1rem' : '1.5rem', maxWidth: '700px' }}
      >
        {questionText}
      </motion.h2>

      {imageUrl && (
        <motion.img
          key={imageUrl}
          src={imageUrl}
          alt=""
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            display: 'block',
            margin: '0 auto 1.5rem',
            maxWidth: 'min(480px, 100%)',
            maxHeight: '42vh',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            borderRadius: '16px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          }}
        />
      )}

      <svg width="110" height="110" style={{ display: 'block', margin: '0 auto' }}>
        <circle cx="55" cy="55" r="45" fill="none" stroke="var(--bg-card)" strokeWidth="8" />
        <circle
          cx="55"
          cy="55"
          r="45"
          fill="none"
          stroke={isUrgent ? 'var(--danger)' : 'var(--accent)'}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
          style={{ transition: 'stroke-dashoffset 0.3s linear, stroke 0.3s' }}
        />
        <text
          x="55"
          y="55"
          textAnchor="middle"
          dominantBaseline="central"
          fill={isUrgent ? 'var(--danger)' : 'var(--text-primary)'}
          fontSize="28"
          fontWeight="700"
          fontFamily="monospace"
        >
          {Math.ceil(timeRemaining)}
        </text>
      </svg>
    </div>
  );
}
