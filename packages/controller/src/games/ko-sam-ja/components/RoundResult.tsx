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

  const good = wasSubject || wasCorrect;
  const tint = good ? '47,224,138' : '255,77,94';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        gap: '1rem',
        textAlign: 'center',
        padding: '1.5rem',
        background: `radial-gradient(600px 400px at 50% 30%, rgba(${tint},.2), transparent)`,
        borderRadius: '20px',
      }}
    >
      {wasSubject ? (
        <>
          <div
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              background: 'var(--violet)',
              display: 'grid',
              placeItems: 'center',
              fontSize: '2.8rem',
              boxShadow: '0 0 40px rgba(139,65,242,.55)',
              animation: 'igra-pop .5s',
            }}
          >
            🕵️
          </div>
          <p className="display" style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>
            Tvoje pitanje
          </p>
          <p
            style={{
              fontSize: '0.95rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            {wrongGuessCount ?? 0} pogrešnih pogađanja
          </p>
          <p
            className="display"
            style={{
              fontSize: '1.8rem',
              fontWeight: 700,
              margin: 0,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--line2)',
              padding: '0.55rem 1.3rem',
              borderRadius: '16px',
              animation: 'igra-pop .6s',
            }}
          >
            +{subjectBonus ?? 0}
          </p>
        </>
      ) : (
        <>
          <div
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              background: wasCorrect ? 'var(--success)' : 'var(--danger)',
              color: wasCorrect ? '#04120b' : '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: '3rem',
              fontWeight: 800,
              boxShadow: `0 0 40px rgba(${tint},.55)`,
              animation: 'igra-pop .5s',
            }}
          >
            {wasCorrect ? '✓' : '✗'}
          </div>
          <p
            className="display"
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: wasCorrect ? 'var(--success)' : 'var(--danger)',
              margin: 0,
            }}
          >
            {wasCorrect ? 'Tačno!' : 'Pogrešno'}
          </p>
          {roundScore > 0 && (
            <p
              className="display"
              style={{
                fontSize: '1.7rem',
                fontWeight: 700,
                margin: 0,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--line2)',
                padding: '0.55rem 1.3rem',
                borderRadius: '16px',
                animation: 'igra-pop .6s',
              }}
            >
              +{roundScore}
            </p>
          )}
        </>
      )}
      <p
        style={{
          fontSize: '0.9rem',
          fontWeight: 700,
          color: 'var(--text-secondary)',
          margin: 0,
        }}
      >
        🏆 Ukupno: {totalScore.toLocaleString()} poena
      </p>
    </div>
  );
}
