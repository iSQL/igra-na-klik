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

  const tint = correct ? '47,224,138' : '255,77,94';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        gap: '1.1rem',
        textAlign: 'center',
        background: `radial-gradient(600px 400px at 50% 30%, rgba(${tint},.22), transparent)`,
        borderRadius: '20px',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '110px',
          height: '110px',
          borderRadius: '50%',
          background: correct ? 'var(--success)' : 'var(--danger)',
          color: correct ? '#04120b' : '#fff',
          display: 'grid',
          placeItems: 'center',
          fontSize: '3.4rem',
          fontWeight: 800,
          boxShadow: `0 0 46px rgba(${tint},.6)`,
          animation: 'igra-pop .5s',
        }}
      >
        {correct ? '✓' : '✗'}
      </div>
      {correct ? (
        <>
          <p
            className="display"
            style={{
              fontSize: '2.2rem',
              fontWeight: 700,
              color: 'var(--success)',
              margin: 0,
            }}
          >
            Tačno!
          </p>
          <p
            className="display"
            style={{
              fontSize: '1.7rem',
              fontWeight: 700,
              margin: 0,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--line2)',
              padding: '0.6rem 1.4rem',
              borderRadius: '16px',
              animation: 'igra-pop .6s',
            }}
          >
            +{myScore?.roundScore ?? 0}{' '}
            <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              poena
            </span>
          </p>
        </>
      ) : (
        <>
          <p
            className="display"
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: 'var(--danger)',
              margin: 0,
            }}
          >
            {myAnswer ? 'Netačno!' : 'Prekasno!'}
          </p>
          <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
            Tačan odgovor:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {results.question.options[results.question.correctIndex].text}
            </strong>
          </p>
        </>
      )}

      {myScore && (
        <p
          style={{
            color: 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '0.9rem',
            margin: 0,
          }}
        >
          🏆 Ukupno: {myScore.totalScore.toLocaleString()}
        </p>
      )}
    </div>
  );
}
