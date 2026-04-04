import type { FibbageAnswerOptionPublic } from '@igra/shared';
import { socket } from '../../../socket';
import { useHaptics } from '../../../hooks/useHaptics';

interface VoteOptionsProps {
  options: FibbageAnswerOptionPublic[];
  hasVoted: boolean;
  votedOptionId: string | null;
  myFakeOptionId: string | null;
  isAutoFinder: boolean;
}

export function VoteOptions({
  options,
  hasVoted,
  votedOptionId,
  myFakeOptionId,
  isAutoFinder,
}: VoteOptionsProps) {
  const haptics = useHaptics();

  const handleVote = (optionId: string) => {
    if (hasVoted) return;
    if (!isAutoFinder && optionId === myFakeOptionId) return;
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'fibbage:vote',
      data: { optionId },
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '1rem',
        gap: '0.75rem',
      }}
    >
      <p
        style={{
          fontSize: '1.1rem',
          fontWeight: 600,
          textAlign: 'center',
          color: 'var(--text-secondary)',
        }}
      >
        Koji je pravi odgovor?
      </p>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          overflowY: 'auto',
        }}
      >
        {options.map((opt) => {
          const isMine = !isAutoFinder && opt.id === myFakeOptionId;
          const isSelected = votedOptionId === opt.id;
          const disabled = hasVoted || isMine;

          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={disabled}
              style={{
                minHeight: '56px',
                background: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                color: isSelected ? '#fff' : 'var(--text-primary)',
                border: isSelected
                  ? '3px solid #fff'
                  : '3px solid transparent',
                borderRadius: '0.75rem',
                padding: '0.9rem 1.1rem',
                fontSize: '1.1rem',
                fontWeight: 600,
                textAlign: 'left',
                opacity: isMine ? 0.4 : hasVoted && !isSelected ? 0.5 : 1,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {opt.text}
              {isMine && (
                <span
                  style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    fontStyle: 'italic',
                  }}
                >
                  (tvoja laž)
                </span>
              )}
            </button>
          );
        })}
      </div>

      {hasVoted && (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: '0.95rem',
          }}
        >
          Glas poslat! Čekamo ostale...
        </p>
      )}
    </div>
  );
}
