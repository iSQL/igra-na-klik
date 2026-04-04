import type { QuizOption } from '@igra/shared';
import { socket } from '../../../socket';

interface AnswerButtonsProps {
  options: QuizOption[];
  hasAnswered: boolean;
  selectedIndex: number | null;
}

export function AnswerButtons({ options, hasAnswered, selectedIndex }: AnswerButtonsProps) {
  const handleAnswer = (optionIndex: number) => {
    if (hasAnswered) return;
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
        return (
          <button
            key={option.index}
            onClick={() => handleAnswer(option.index)}
            disabled={hasAnswered}
            style={{
              background: option.color,
              border: isSelected ? '4px solid #fff' : '4px solid transparent',
              borderRadius: '1rem',
              color: '#fff',
              fontSize: '1.3rem',
              fontWeight: 700,
              opacity: hasAnswered && !isSelected ? 0.4 : 1,
              transition: 'opacity 0.2s, transform 0.1s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '1rem',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {option.text}
          </button>
        );
      })}
    </div>
  );
}
