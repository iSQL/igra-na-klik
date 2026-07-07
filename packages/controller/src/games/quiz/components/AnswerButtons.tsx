import type { QuizOption } from '@igra/shared';
import { socket } from '../../../socket';
import { useHaptics } from '../../../hooks/useHaptics';

interface AnswerButtonsProps {
  options: QuizOption[];
  hasAnswered: boolean;
  selectedIndex: number | null;
}

// Fixed per-slot shape + text color so muscle memory builds across games —
// cyan and amber are bright enough to need dark text.
export const OPTION_SHAPES = ['▲', '◆', '●', '■'] as const;
export const OPTION_TEXT_COLORS: Record<string, string> = {
  '#FF2E88': '#fff',
  '#22DEE6': '#04222a',
  '#FFB627': '#2b1c00',
  '#8B41F2': '#fff',
};

export function AnswerButtons({ options, hasAnswered, selectedIndex }: AnswerButtonsProps) {
  const haptics = useHaptics();

  const handleAnswer = (optionIndex: number) => {
    if (hasAnswered) return;
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'quiz:answer',
      data: { optionIndex },
    });
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.75rem',
        width: '100%',
        height: '100%',
        padding: '0.5rem',
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
              background: option.color,
              border: isSelected ? '4px solid #fff' : '4px solid transparent',
              borderRadius: '16px',
              color: textColor,
              fontSize: '1.15rem',
              fontWeight: 800,
              opacity: hasAnswered && !isSelected ? 0.4 : 1,
              transition: 'opacity 0.2s, transform 0.1s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              textAlign: 'center',
              padding: '1rem',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>
              {OPTION_SHAPES[option.index] ?? '●'}
            </span>
            {option.text}
          </button>
        );
      })}
    </div>
  );
}
