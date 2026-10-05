import type { FibbageAnswerOptionPublic } from '@igra/shared';
import { socket } from '../../../socket';
import { useHaptics } from '../../../hooks/useHaptics';
import { DoneFaces, type ProgressPlayer } from '../../../components/kit/WaitingPanel';

interface VoteOptionsProps {
  options: FibbageAnswerOptionPublic[];
  hasVoted: boolean;
  votedOptionId: string | null;
  myFakeOptionId: string | null;
  /** Expected voters with a done flag — ids only, never the pick. */
  voters: ProgressPlayer[];
}

export function VoteOptions({
  options,
  hasVoted,
  votedOptionId,
  myFakeOptionId,
  voters,
}: VoteOptionsProps) {
  const haptics = useHaptics();

  const handleVote = (optionId: string) => {
    if (hasVoted) return;
    if (optionId === myFakeOptionId) return;
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
        padding: '1rem 0 0.25rem',
        gap: '0.75rem',
      }}
    >
      <p
        style={{
          fontSize: '0.8rem',
          fontWeight: 800,
          textAlign: 'center',
          color: 'var(--amber)',
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
          const isMine = opt.id === myFakeOptionId;
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
                  ? 'rgba(194,155,71,.14)'
                  : 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: isSelected
                  ? '3px solid var(--accent)'
                  : '1.5px solid var(--line2)',
                borderRadius: '16px',
                padding: '0.9rem 1.1rem',
                fontSize: '1.08rem',
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
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 7,
                    background: 'var(--accent)',
                    color: 'var(--bg-primary)',
                    flexShrink: 0,
                  }}
                >
                  Tvoj glas
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

      <DoneFaces players={voters} verb="glasalo" />
    </div>
  );
}
