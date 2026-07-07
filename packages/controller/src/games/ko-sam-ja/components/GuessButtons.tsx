import type { KoSamJaPublicOption } from '@igra/shared';
import { KO_SAM_JA_FIXED_OPTION_COLORS } from '@igra/shared';
import { socket } from '../../../socket';
import { useHaptics } from '../../../hooks/useHaptics';
import { OPTION_TEXT_COLORS } from '../../quiz/components/AnswerButtons';

interface GuessButtonsProps {
  options: KoSamJaPublicOption[];
  hasGuessed: boolean;
  selectedOptionId: string | null;
}

export function GuessButtons({
  options,
  hasGuessed,
  selectedOptionId,
}: GuessButtonsProps) {
  const haptics = useHaptics();

  const handleGuess = (optionId: string) => {
    if (hasGuessed) return;
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'ko-sam-ja:guess',
      data: { optionId },
    });
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridAutoRows: options.length > 4 ? 'minmax(64px, 1fr)' : '1fr',
        gap: '0.75rem',
        width: '100%',
        height: '100%',
        padding: '0.5rem',
        overflowY: options.length > 4 ? 'auto' : 'visible',
      }}
    >
      {options.map((option, i) => {
        const isSelected = selectedOptionId === option.id;
        const color =
          KO_SAM_JA_FIXED_OPTION_COLORS[
            i % KO_SAM_JA_FIXED_OPTION_COLORS.length
          ];
        return (
          <button
            key={option.id}
            onClick={() => handleGuess(option.id)}
            disabled={hasGuessed}
            style={{
              background: color,
              border: isSelected ? '4px solid #fff' : '4px solid transparent',
              borderRadius: '16px',
              color: OPTION_TEXT_COLORS[color] ?? '#fff',
              fontSize: '1.1rem',
              fontWeight: 800,
              opacity: hasGuessed && !isSelected ? 0.4 : 1,
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
