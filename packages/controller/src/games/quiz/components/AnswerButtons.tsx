import type { QuizOption } from '@igra/shared';
import { socket } from '../../../socket';
import { useHaptics } from '../../../hooks/useHaptics';

interface AnswerButtonsProps {
  options: QuizOption[];
  hasAnswered: boolean;
  selectedIndex: number | null;
  /** game:player-action name to emit (Vruć krompir reuses 'potato:answer'). */
  action?: string;
}

// Fixed per-slot shape + text color so muscle memory builds across games —
// teal and amber are bright enough to need dark text.
export const OPTION_SHAPES = ['▲', '◆', '●', '■'] as const;
export const OPTION_TEXT_COLORS: Record<string, string> = {
  '#C75146': '#fff',
  '#6FC2BB': '#0d2b28',
  '#E3B45E': '#2c2007',
  '#7C5FA8': '#fff',
};

export function AnswerButtons({
  options,
  hasAnswered,
  selectedIndex,
  action = 'quiz:answer',
}: AnswerButtonsProps) {
  const haptics = useHaptics();

  const handleAnswer = (optionIndex: number) => {
    if (hasAnswered) return;
    haptics.tap();
    socket.emit('game:player-action', {
      action,
      data: { optionIndex },
    });
  };

  // One type size for the whole grid (sized to the longest answer), so the
  // four tiles read as a set rather than four different fonts.
  const longest = Math.max(0, ...options.map((o) => o.text.length));
  const fontSize = optionFontSize(longest);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridAutoRows: '1fr',
        gap: '10px',
        width: '100%',
        height: '100%',
      }}
    >
      {options.map((option) => {
        const isSelected = selectedIndex === option.index;
        const textColor = OPTION_TEXT_COLORS[option.color] ?? '#fff';
        return (
          <button
            key={option.index}
            onClick={() => handleAnswer(option.index)}
            disabled={hasAnswered}
            style={{
              position: 'relative',
              background: option.color,
              border: isSelected ? '4px solid #fff' : '4px solid transparent',
              borderRadius: '22px',
              // Pressed-in bottom edge — reads as a physical key.
              boxShadow: 'inset 0 -5px 0 rgba(0,0,0,.18)',
              color: textColor,
              opacity: hasAnswered && !isSelected ? 0.4 : 1,
              transition: 'opacity 0.2s, transform 0.1s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '0.5rem',
              textAlign: 'left',
              padding: '14px',
              minHeight: '96px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: '1.35rem', lineHeight: 1, opacity: 0.85 }}>
              {OPTION_SHAPES[option.index] ?? '●'}
            </span>
            <span
              className="display"
              style={{
                fontWeight: 700,
                fontSize,
                lineHeight: 1.1,
                wordBreak: 'break-word',
                hyphens: 'auto',
              }}
            >
              {option.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function optionFontSize(chars: number): string {
  if (chars <= 6) return '1.9rem';
  if (chars <= 12) return '1.5rem';
  if (chars <= 24) return '1.2rem';
  return '1.02rem';
}
