import { useEffect } from 'react';
import type { QuizResultData } from '@igra/shared';
import { usePlayerStore } from '../../../store/playerStore';
import { useHaptics } from '../../../hooks/useHaptics';
import { RoundVerdict, verdictWash } from '../../../components/kit/RoundVerdict';
import { OPTION_SHAPES, OPTION_TEXT_COLORS } from './AnswerButtons';

interface RoundResultProps {
  results: QuizResultData;
}

export function RoundResult({ results }: RoundResultProps) {
  const playerId = usePlayerStore((s) => s.player?.id);
  const roster = usePlayerStore((s) => s.room?.players ?? []);
  const haptics = useHaptics();

  const myAnswer = results.answers.find((a) => a.playerId === playerId);
  const myScore = results.scores.find((s) => s.playerId === playerId);
  const correct = myAnswer?.correct ?? false;
  const correctIndex = results.question.correctIndex;

  useEffect(() => {
    if (correct) haptics.success();
    else haptics.error();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!playerId) return null;

  const nameOf = (id: string) =>
    id === playerId ? 'Ti' : (roster.find((p) => p.id === id)?.name ?? '?');

  // Group choosers per option index.
  const choosersByOption = new Map<number, string[]>();
  for (const a of results.answers) {
    const arr = choosersByOption.get(a.optionIndex) ?? [];
    arr.push(a.playerId);
    choosersByOption.set(a.optionIndex, arr);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        gap: '1.5rem',
        padding: '1.5rem 0 0.5rem',
        overflowY: 'auto',
        background: verdictWash(correct ? 'correct' : 'wrong'),
      }}
    >
      <RoundVerdict
        kind={correct ? 'correct' : 'wrong'}
        title={correct ? 'Tačno!' : myAnswer ? 'Netačno!' : 'Prekasno!'}
        points={myScore?.roundScore ?? 0}
        total={myScore?.totalScore}
      />

      {/* Every option with the correct one flagged and one line of who picked
          it — the distribution at a glance, without rows of avatar chips. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.question.options.map((opt) => {
          const isCorrect = opt.index === correctIndex;
          const isMine = myAnswer?.optionIndex === opt.index;
          const choosers = choosersByOption.get(opt.index) ?? [];
          // "Ti" first, so you find yourself without reading the whole line.
          const names = choosers
            .slice()
            .sort((a, b) => Number(b === playerId) - Number(a === playerId))
            .map(nameOf);
          return (
            <div
              key={opt.index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 56,
                padding: '8px 12px',
                borderRadius: 16,
                background: isCorrect ? 'rgba(87,179,128,.14)' : 'var(--bg-secondary)',
                border: isCorrect
                  ? '2px solid var(--success)'
                  : isMine
                    ? '2px solid rgba(224,106,94,.6)'
                    : '1px solid var(--line)',
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: opt.color,
                  color: OPTION_TEXT_COLORS[opt.color] ?? '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                {OPTION_SHAPES[opt.index] ?? '●'}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', wordBreak: 'break-word' }}>
                  {opt.text}
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {names.length ? names.join(', ') : 'Niko'}
                </span>
              </span>
              {isCorrect && (
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    color: 'var(--success-ink)',
                    flexShrink: 0,
                  }}
                >
                  ✓ Tačno
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
