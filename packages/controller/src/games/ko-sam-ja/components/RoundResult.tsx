interface RoundResultProps {
  wasSubject: boolean;
  wasCorrect: boolean;
  roundScore: number;
  totalScore: number;
  subjectBonus?: number;
  wrongGuessCount?: number;
  skipped?: boolean;
}

export function RoundResult({
  wasSubject,
  wasCorrect,
  roundScore,
  totalScore,
  subjectBonus,
  wrongGuessCount,
  skipped,
}: RoundResultProps) {
  if (skipped) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '0.75rem',
          textAlign: 'center',
          padding: '1rem',
        }}
      >
        <p style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
          Runda preskočena
        </p>
        <p
          style={{
            fontSize: '1rem',
            color: 'var(--text-secondary)',
            margin: 0,
          }}
        >
          Ukupno: {totalScore.toLocaleString()} poena
        </p>
      </div>
    );
  }

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
      {wasSubject ? (
        <>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            Tvoje pitanje
          </p>
          <p
            style={{
              fontSize: '1rem',
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            {wrongGuessCount ?? 0} pogrešnih pogađanja
          </p>
          <p
            style={{
              fontSize: '2.6rem',
              fontWeight: 800,
              color: 'var(--accent)',
              margin: 0,
            }}
          >
            +{subjectBonus ?? 0}
          </p>
        </>
      ) : (
        <>
          <p
            style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              color: wasCorrect ? 'var(--success)' : 'var(--danger)',
              margin: 0,
            }}
          >
            {wasCorrect ? 'Tačno!' : 'Pogrešno'}
          </p>
          <p
            style={{
              fontSize: '2.4rem',
              fontWeight: 800,
              color: 'var(--accent)',
              margin: 0,
            }}
          >
            +{roundScore}
          </p>
        </>
      )}
      <p
        style={{
          fontSize: '0.95rem',
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        Ukupno: {totalScore.toLocaleString()} poena
      </p>
    </div>
  );
}
