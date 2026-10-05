import { useMemo } from 'react';
import type { QuizResultData } from '@igra/shared';
import { usePlayerStore } from '../../../store/playerStore';
import { useGameStore } from '../../../store/gameStore';
import {
  RoundVerdict,
  verdictWash,
  type VerdictStanding,
} from '../../../components/kit/RoundVerdict';
import { OPTION_SHAPES, OPTION_TEXT_COLORS } from './AnswerButtons';

// Correct answers in a row, across rounds of one match. Module-level because
// the result screen remounts every round; a round number that doesn't follow
// the last one (new match, or a non-choice question in between) restarts it.
const streak = { round: 0, count: 0 };

function bumpStreak(round: number, correct: boolean): number {
  if (round === streak.round) return streak.count; // remount, same round
  streak.count = correct ? (round === streak.round + 1 ? streak.count + 1 : 1) : 0;
  streak.round = round;
  return streak.count;
}

/** Rank now vs. before this round's points, plus the gap to the next place. */
function standingOf(
  scores: QuizResultData['scores'],
  playerId: string
): Omit<VerdictStanding, 'streak'> | undefined {
  const me = scores.find((s) => s.playerId === playerId);
  if (!me || scores.length < 2) return undefined;
  const rankBy = (val: (s: QuizResultData['scores'][number]) => number) =>
    scores.filter((s) => val(s) > val(me)).length + 1;
  const rank = rankBy((s) => s.totalScore);
  const before = rankBy((s) => s.totalScore - s.roundScore);
  const above = scores
    .map((s) => s.totalScore)
    .filter((t) => t > me.totalScore)
    .sort((a, b) => a - b)[0];
  return {
    rank,
    total: me.totalScore,
    moved: before - rank,
    gapUp: above !== undefined ? above - me.totalScore : undefined,
  };
}

interface RoundResultProps {
  results: QuizResultData;
}

export function RoundResult({ results }: RoundResultProps) {
  const playerId = usePlayerStore((s) => s.player?.id);
  const roster = usePlayerStore((s) => s.room?.players ?? []);
  const round = useGameStore((s) => s.gameState?.round ?? 0);

  const myAnswer = results.answers.find((a) => a.playerId === playerId);
  const myScore = results.scores.find((s) => s.playerId === playerId);
  const correct = myAnswer?.correct ?? false;
  const correctIndex = results.question.correctIndex;

  // Cues (vibration/sound) fire inside RoundVerdict.
  const inARow = useMemo(() => bumpStreak(round, correct), [round, correct]);
  const standing = playerId ? standingOf(results.scores, playerId) : undefined;

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
        title={correct ? 'Tačno!' : myAnswer ? 'Ovaj put ne' : 'Nisi stigao/la'}
        icon={myAnswer ? undefined : '⏱'}
        points={myScore?.roundScore ?? 0}
        total={myScore?.totalScore}
        detail={
          correct && myAnswer
            ? `Odgovor za ${(myAnswer.timeMs / 1000).toLocaleString('sr-RS', { maximumFractionDigits: 1 })} s`
            : undefined
        }
        standing={standing && { ...standing, streak: inARow }}
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
