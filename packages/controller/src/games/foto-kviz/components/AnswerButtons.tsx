import type { QuizOption } from '@igra/shared';

interface AnswerButtonsProps {
  options: QuizOption[];
  onPick: (index: number) => void;
  disabled?: boolean;
  selectedIndex?: number;
  /** When set, the button at this index renders with a green outline (reveal). */
  correctIndex?: number;
}

/**
 * Four colored answer buttons used by Foto kviz. Mobile-first layout — each
 * button is a stacked block with min-height 80px so taps are forgiving.
 */
export function AnswerButtons({
  options,
  onPick,
  disabled,
  selectedIndex,
  correctIndex,
}: AnswerButtonsProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '0.6rem',
        width: '100%',
      }}
    >
      {options.map((opt) => {
        const isSelected = selectedIndex === opt.index;
        const isCorrect = correctIndex !== undefined && opt.index === correctIndex;
        const isWrong = correctIndex !== undefined && !isCorrect;
        return (
          <button
            key={opt.index}
            onClick={() => !disabled && onPick(opt.index)}
            disabled={disabled}
            style={{
              minHeight: '80px',
              padding: '0.75rem 0.6rem',
              borderRadius: '12px',
              background: opt.color,
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 700,
              lineHeight: 1.25,
              border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: isWrong ? 0.45 : 1,
              transform: isSelected ? 'scale(0.97)' : 'scale(1)',
              outline: isCorrect
                ? '3px solid #7be37b'
                : isSelected
                ? '3px solid #fff'
                : 'none',
              outlineOffset: '2px',
              boxShadow: isCorrect
                ? '0 0 14px rgba(123, 227, 123, 0.55)'
                : '0 1px 4px rgba(0,0,0,0.4)',
              transition: 'transform 0.1s, opacity 0.2s',
            }}
          >
            {isCorrect && '✓ '}
            {opt.text}
          </button>
        );
      })}
    </div>
  );
}
