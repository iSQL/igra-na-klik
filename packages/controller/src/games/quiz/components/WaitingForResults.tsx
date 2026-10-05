import type { QuizOption } from '@igra/shared';
import { WaitingPanel, type ProgressPlayer } from '../../../components/kit/WaitingPanel';
import { OPTION_SHAPES, OPTION_TEXT_COLORS } from './AnswerButtons';

interface WaitingForResultsProps {
  option: QuizOption | undefined;
  players: ProgressPlayer[];
}

// Answer locked: shows WHAT you picked (not only a ✓ in its color) and who
// the room is still waiting on.
export function WaitingForResults({ option, players }: WaitingForResultsProps) {
  // Hex, not a CSS var — the glow appends alpha suffixes.
  const color = option?.color ?? '#c29b47';
  return (
    <WaitingPanel
      hero={
        <div
          style={{
            width: 168,
            height: 168,
            borderRadius: 36,
            background: color,
            color: (option && OPTION_TEXT_COLORS[option.color]) ?? '#fff',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            textAlign: 'left',
            boxShadow: `0 0 0 6px ${color}40, 0 20px 50px ${color}59`,
            animation: 'igra-pop .4s',
          }}
        >
          <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>
            {option ? (OPTION_SHAPES[option.index] ?? '●') : '✓'}
          </span>
          <span
            className="display"
            style={{
              fontWeight: 700,
              fontSize: (option?.text.length ?? 0) <= 6 ? '2.5rem' : '1.3rem',
              lineHeight: 1.05,
              wordBreak: 'break-word',
              overflow: 'hidden',
            }}
          >
            {option?.text}
          </span>
        </div>
      }
      title="Odgovor zaključan"
      subtitle="Rezultat stiže kad svi odgovore ili istekne vreme."
      progressLabel="Ko je odgovorio"
      players={players}
    />
  );
}
