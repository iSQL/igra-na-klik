import { useEffect } from 'react';
import type { QuizResultData } from '@igra/shared';
import { usePlayerStore } from '../../../store/playerStore';
import { useHaptics } from '../../../hooks/useHaptics';

interface RoundResultProps {
  results: QuizResultData;
}

export function RoundResult({ results }: RoundResultProps) {
  const playerId = usePlayerStore((s) => s.player?.id);
  const haptics = useHaptics();
  if (!playerId) return null;

  const myAnswer = results.answers.find((a) => a.playerId === playerId);
  const myScore = results.scores.find((s) => s.playerId === playerId);
  const correct = myAnswer?.correct ?? false;

  useEffect(() => {
    if (correct) haptics.success();
    else haptics.error();
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1rem',
        textAlign: 'center',
      }}
    >
      {correct ? (
        <>
          <div style={{ fontSize: '4rem' }}>✓</div>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>
            Tačno!
          </p>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>
            +{myScore?.roundScore ?? 0}
          </p>
        </>
      ) : (
        <>
          <div style={{ fontSize: '4rem' }}>✗</div>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)' }}>
            {myAnswer ? 'Netačno!' : 'Prekasno!'}
          </p>
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
            Tačan odgovor:{' '}
            <strong>{results.question.options[results.question.correctIndex].text}</strong>
          </p>
        </>
      )}

      {myScore && (
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Ukupno: {myScore.totalScore.toLocaleString()}
        </p>
      )}
    </div>
  );
}
