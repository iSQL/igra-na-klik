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
          fontSize: '0.8rem',
          fontWeight: 800,
          textAlign: 'center',
          color: 'var(--pink)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          margin: 0,
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
                background: isSelected
                  ? 'rgba(217,123,108,.14)'
                  : 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: isSelected
                  ? '2px solid var(--pink)'
                  : '1.5px solid var(--line2)',
                borderRadius: '14px',
                padding: '0.9rem 1.1rem',
                fontSize: '1rem',
                fontWeight: 800,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                opacity: isMine ? 0.4 : hasVoted && !isSelected ? 0.5 : 1,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span>{opt.text}</span>
              {isSelected && (
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--pink)', flexShrink: 0 }}>
                  ✓ tvoj glas
                </span>
              )}
              {isMine && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    color: 'var(--text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  (tvoja laž 🤥)
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
