import { useEffect } from 'react';
import type { QuizResultData } from '@igra/shared';
import { usePlayerStore } from '../../../store/playerStore';
import { useHaptics } from '../../../hooks/useHaptics';

interface RoundResultProps {
  results: QuizResultData;
}

export function RoundResult({ results }: RoundResultProps) {
  const playerId = usePlayerStore((s) => s.player?.id);
  const roster = usePlayerStore((s) => s.room?.players ?? []);
  const haptics = useHaptics();
  if (!playerId) return null;

  const myAnswer = results.answers.find((a) => a.playerId === playerId);
  const myScore = results.scores.find((s) => s.playerId === playerId);
  const correct = myAnswer?.correct ?? false;
  const correctIndex = results.question.correctIndex;

  useEffect(() => {
    if (correct) haptics.success();
    else haptics.error();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameOf = (id: string) => roster.find((p) => p.id === id)?.name ?? '?';
  const colorOf = (id: string) => roster.find((p) => p.id === id)?.avatarColor ?? '#888';
  const emojiOf = (id: string) => roster.find((p) => p.id === id)?.avatarEmoji ?? '';

  // Group choosers per option index.
  const choosersByOption = new Map<number, string[]>();
  for (const a of results.answers) {
    const arr = choosersByOption.get(a.optionIndex) ?? [];
    arr.push(a.playerId);
    choosersByOption.set(a.optionIndex, arr);
  }

  const tint = correct ? '47,224,138' : '255,77,94';
  const roundScore = myScore?.roundScore ?? 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        width: '100%',
        gap: '0.8rem',
        padding: '1rem 0.9rem',
        overflowY: 'auto',
        background: `radial-gradient(600px 360px at 50% 0%, rgba(${tint},.18), transparent)`,
      }}
    >
      {/* Verdict + points earned this question */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexShrink: 0 }}>
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            background: correct ? 'var(--success)' : 'var(--danger)',
            color: correct ? '#04120b' : '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: '1.7rem',
            fontWeight: 800,
            boxShadow: `0 0 26px rgba(${tint},.5)`,
            animation: 'igra-pop .5s',
            flexShrink: 0,
          }}
        >
          {correct ? '✓' : '✗'}
        </div>
        <div style={{ textAlign: 'left' }}>
          <p
            className="display"
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: correct ? 'var(--success)' : 'var(--danger)',
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            {correct ? 'Tačno!' : myAnswer ? 'Netačno!' : 'Prekasno!'}
          </p>
          <p
            className="display"
            style={{
              fontSize: '1.1rem',
              fontWeight: 800,
              margin: '0.15rem 0 0',
              color: roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
            }}
          >
            +{roundScore}{' '}
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
              poena
            </span>
          </p>
        </div>
      </div>

      {/* Every option, with the correct one flagged, my pick outlined, and the
          players who chose it — so you see your answer, everyone else's, and
          the distribution at a glance. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          width: '100%',
          maxWidth: '460px',
        }}
      >
        {results.question.options.map((opt) => {
          const isCorrect = opt.index === correctIndex;
          const isMine = myAnswer?.optionIndex === opt.index;
          const choosers = choosersByOption.get(opt.index) ?? [];
          return (
            <div
              key={opt.index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                padding: '0.6rem 0.7rem',
                borderRadius: '14px',
                background: isCorrect ? 'rgba(47,224,138,.12)' : 'var(--bg-secondary)',
                border: isMine
                  ? '2px solid var(--text-primary)'
                  : isCorrect
                    ? '1px solid var(--success)'
                    : '1px solid var(--line2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <span
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '4px',
                    background: opt.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    wordBreak: 'break-word',
                  }}
                >
                  {opt.text}
                </span>
                {isMine && (
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    tvoj izbor
                  </span>
                )}
                {isCorrect && (
                  <span style={{ color: 'var(--success)', fontWeight: 800, flexShrink: 0 }}>✓</span>
                )}
              </div>

              {choosers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {choosers.map((id) => (
                    <span
                      key={id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.1rem 0.45rem 0.1rem 0.15rem',
                        borderRadius: '999px',
                        background: 'var(--bg-card)',
                        border:
                          id === playerId
                            ? '1px solid var(--text-secondary)'
                            : '1px solid var(--line2)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        maxWidth: '100%',
                      }}
                    >
                      <span
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: colorOf(id),
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '0.65rem',
                          flexShrink: 0,
                        }}
                      >
                        {emojiOf(id)}
                      </span>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {id === playerId ? 'Ti' : nameOf(id)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {myScore && (
        <p
          style={{
            color: 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '0.85rem',
            margin: '0.1rem 0 0',
            flexShrink: 0,
          }}
        >
          🏆 Ukupno: {myScore.totalScore.toLocaleString()}
        </p>
      )}
    </div>
  );
}
