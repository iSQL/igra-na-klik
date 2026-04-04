import { useEffect } from 'react';
import { useHaptics } from '../../../hooks/useHaptics';

interface RoundResultProps {
  foundTruth: boolean;
  fooledCount: number;
  roundScore: number;
  realAnswer: string;
}

export function RoundResult({
  foundTruth,
  fooledCount,
  roundScore,
  realAnswer,
}: RoundResultProps) {
  const haptics = useHaptics();

  useEffect(() => {
    if (foundTruth || fooledCount > 0) haptics.success();
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
        padding: '1rem',
      }}
    >
      {foundTruth ? (
        <>
          <div style={{ fontSize: '4rem' }}>✓</div>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>
            Pogodio/la si!
          </p>
        </>
      ) : (
        <>
          <div style={{ fontSize: '4rem' }}>✗</div>
          <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--danger)' }}>
            Nije tačno.
          </p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Tačan odgovor: <strong>{realAnswer}</strong>
          </p>
        </>
      )}

      {fooledCount > 0 && (
        <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--accent)' }}>
          Prevario/la si {fooledCount}!
        </p>
      )}

      {roundScore > 0 && (
        <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>
          +{roundScore}
        </p>
      )}
    </div>
  );
}
