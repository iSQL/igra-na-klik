import { useState } from 'react';
import type { KoSamJaPublicOption } from '@igra/shared';
import { socket } from '../../../socket';
import { useHaptics } from '../../../hooks/useHaptics';

interface SubjectPickerProps {
  questionText: string;
  options: KoSamJaPublicOption[];
  hasPicked: boolean;
}

export function SubjectPicker({
  questionText,
  options,
  hasPicked,
}: SubjectPickerProps) {
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const haptics = useHaptics();

  const submit = (optionId: string) => {
    if (hasPicked || submittedId) return;
    haptics.tap();
    setSubmittedId(optionId);
    socket.emit('game:player-action', {
      action: 'ko-sam-ja:submit-peer-pick',
      data: { optionId },
    });
  };

  const locked = hasPicked || !!submittedId;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '1rem',
        gap: '1rem',
      }}
    >
      <p
        style={{
          fontSize: '1.15rem',
          fontWeight: 700,
          lineHeight: 1.3,
          textAlign: 'center',
          margin: 0,
        }}
      >
        {questionText}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: options.length <= 2 ? '1fr' : '1fr 1fr',
          gridAutoRows: options.length > 4 ? 'minmax(64px, 1fr)' : '1fr',
          gap: '0.7rem',
          flex: 1,
          overflowY: options.length > 4 ? 'auto' : 'visible',
        }}
      >
        {options.map((opt) => {
          const isSelected = submittedId === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => submit(opt.id)}
              disabled={locked}
              style={{
                background: isSelected ? 'var(--success)' : 'var(--accent)',
                color: '#fff',
                border: isSelected ? '4px solid #fff' : '4px solid transparent',
                borderRadius: '1rem',
                padding: '1rem',
                fontSize: '1.4rem',
                fontWeight: 700,
                opacity: locked && !isSelected ? 0.4 : 1,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {opt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
