import { useEffect, useRef, useState } from 'react';
import type { KoSamJaUpfrontQuestion } from '@igra/shared';
import { KO_SAM_JA_FIXED_OPTION_COLORS } from '@igra/shared';
import { socket } from '../../../socket';
import { useHaptics } from '../../../hooks/useHaptics';

interface UpfrontStepperProps {
  question: KoSamJaUpfrontQuestion;
  completedCount: number;
  totalAssigned: number;
}

export function UpfrontStepper({
  question,
  completedCount,
  totalAssigned,
}: UpfrontStepperProps) {
  const [text, setText] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const haptics = useHaptics();
  const lastQuestionIdRef = useRef<string | null>(null);

  // Reset local state when the question changes (next pending question
  // arrives via server state update).
  useEffect(() => {
    if (lastQuestionIdRef.current !== question.id) {
      lastQuestionIdRef.current = question.id;
      setText('');
      setSubmittingId(null);
    }
  }, [question.id]);

  const submitFixed = (optionIndex: number) => {
    if (submittingId === question.id) return;
    haptics.tap();
    setSubmittingId(question.id);
    socket.emit('game:player-action', {
      action: 'ko-sam-ja:submit-upfront',
      data: { questionId: question.id, optionIndex },
    });
  };

  const submitFree = () => {
    const trimmed = text.trim();
    if (!trimmed || submittingId === question.id) return;
    haptics.tap();
    setSubmittingId(question.id);
    socket.emit('game:player-action', {
      action: 'ko-sam-ja:submit-upfront',
      data: { questionId: question.id, text: trimmed },
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '1rem',
        gap: '0.85rem',
      }}
    >
      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          margin: 0,
          textAlign: 'center',
        }}
      >
        Pitanje {completedCount + 1}/{totalAssigned} o tebi
      </p>

      <p
        style={{
          fontSize: '1.2rem',
          fontWeight: 700,
          lineHeight: 1.3,
          textAlign: 'center',
          margin: 0,
        }}
      >
        {question.text}
      </p>

      {question.shape === 'fixed' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: question.options.length <= 2 ? '1fr' : '1fr 1fr',
            gap: '0.6rem',
            flex: 1,
          }}
        >
          {question.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => submitFixed(i)}
              disabled={submittingId === question.id}
              style={{
                background:
                  KO_SAM_JA_FIXED_OPTION_COLORS[
                    i % KO_SAM_JA_FIXED_OPTION_COLORS.length
                  ],
                border: '4px solid transparent',
                borderRadius: '0.85rem',
                color: '#fff',
                fontSize: '1.2rem',
                fontWeight: 700,
                padding: '1rem',
                opacity: submittingId === question.id ? 0.5 : 1,
                WebkitTapHighlightColor: 'transparent',
                minHeight: '64px',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {question.shape === 'free' && (
        <>
          <textarea
            value={text}
            onChange={(e) =>
              setText(e.target.value.slice(0, question.maxLength))
            }
            placeholder="Tvoj odgovor…"
            autoFocus
            style={{
              flex: 1,
              minHeight: '120px',
              width: '100%',
              fontSize: '1.15rem',
              padding: '0.85rem',
              borderRadius: '0.75rem',
              border: '2px solid var(--bg-card)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              resize: 'none',
              fontFamily: 'inherit',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}
          >
            <span>
              {text.length}/{question.maxLength}
            </span>
          </div>
          <button
            onClick={submitFree}
            disabled={!text.trim() || submittingId === question.id}
            style={{
              background:
                text.trim() && submittingId !== question.id
                  ? 'var(--accent)'
                  : 'var(--bg-card)',
              color:
                text.trim() && submittingId !== question.id
                  ? '#fff'
                  : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '0.75rem',
              padding: '0.85rem',
              fontSize: '1.2rem',
              fontWeight: 700,
              minHeight: '52px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Pošalji
          </button>
        </>
      )}
    </div>
  );
}
