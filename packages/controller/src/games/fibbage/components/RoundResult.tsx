import { useEffect } from 'react';
import { useHaptics } from '../../../hooks/useHaptics';

interface RoundResultProps {
  foundTruth: boolean;
  fooledCount: number;
  roundScore: number;
  realAnswer: string;
  /** True when the player let the writing phase run out this round. */
  wroteLie: boolean;
  /** True when the truth bonus was withheld because they wrote nothing. */
  truthBonusWithheld: boolean;
  /** Everyone who fell for this player's lie, by name. */
  fooledNames: string[];
  /** This player's lie, so the names have something to point at. */
  myLieText: string | null;
  /** Author(s) of the lie this player fell for — empty if they found the truth. */
  fooledByNames: string[];
  /** That lie's text. */
  fooledByText: string | null;
}

export function RoundResult({
  foundTruth,
  fooledCount,
  roundScore,
  realAnswer,
  wroteLie,
  truthBonusWithheld,
  fooledNames,
  myLieText,
  fooledByNames,
  fooledByText,
}: RoundResultProps) {
  const haptics = useHaptics();

  useEffect(() => {
    if (foundTruth || fooledCount > 0) haptics.success();
    else haptics.error();
  }, []);

  const good = foundTruth || fooledCount > 0;
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
      <div
        style={{
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: foundTruth ? 'var(--success)' : good ? 'var(--pink)' : 'var(--danger)',
          color: foundTruth ? '#04120b' : '#fff',
          display: 'grid',
          placeItems: 'center',
          fontSize: '3rem',
          fontWeight: 800,
          boxShadow: `0 0 40px rgba(${tint},.55)`,
          animation: 'igra-pop .5s',
        }}
      >
        {foundTruth ? '✓' : good ? '🤥' : '✗'}
      </div>
      {foundTruth ? (
        <p
          className="display"
          style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--success)', margin: 0 }}
        >
          Pogodio/la si!
        </p>
      ) : (
        <>
          <p
            className="display"
            style={{
              fontSize: '1.6rem',
              fontWeight: 700,
              color: good ? 'var(--text-primary)' : 'var(--danger)',
              margin: 0,
            }}
          >
            Nije tačno.
          </p>
          <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
            Tačan odgovor:{' '}
            <strong style={{ color: 'var(--success)' }}>{realAnswer}</strong>
          </p>
        </>
      )}

      {truthBonusWithheld && (
        <p
          style={{
            fontSize: '0.9rem',
            fontWeight: 800,
            color: 'var(--danger)',
            background: 'rgba(255,77,94,.14)',
            padding: '0.5rem 1rem',
            borderRadius: '12px',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          Pogodio/la si, ali nisi napisao/la laž — bez poena ove runde.
        </p>
      )}

      {!wroteLie && !truthBonusWithheld && (
        <p
          style={{
            fontSize: '0.88rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          Nisi napisao/la laž ove runde.
        </p>
      )}

      {/* Naming who fell for it is the whole point — a bare count tells the
          player nothing they'd repeat out loud afterwards. */}
      {fooledCount > 0 && (
        <div
          style={{
            color: 'var(--pink)',
            background: 'rgba(217,123,108,.14)',
            padding: '0.55rem 1rem',
            borderRadius: '12px',
            margin: 0,
            lineHeight: 1.45,
          }}
        >
          <p style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>
            🤥 Nasamario/la si{' '}
            {fooledNames.length > 0 ? fooledNames.join(', ') : `${fooledCount}!`}
          </p>
          {myLieText && (
            <p
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                margin: '0.15rem 0 0',
                color: 'var(--text-secondary)',
              }}
            >
              tvojom laži „{myLieText}"
            </p>
          )}
        </div>
      )}

      {/* And the other direction: whose lie caught you. */}
      {fooledByNames.length > 0 && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--line2)',
            padding: '0.55rem 1rem',
            borderRadius: '12px',
            margin: 0,
            lineHeight: 1.45,
          }}
        >
          <p
            style={{
              fontSize: '0.95rem',
              fontWeight: 800,
              margin: 0,
              color: 'var(--text-primary)',
            }}
          >
            🎣 Nasamario/la te je {fooledByNames.join(' i ')}
          </p>
          {fooledByText && (
            <p
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                margin: '0.15rem 0 0',
                color: 'var(--text-secondary)',
              }}
            >
              laži „{fooledByText}"
            </p>
          )}
        </div>
      )}

      {roundScore > 0 && (
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
          +{roundScore}{' '}
          <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>poena</span>
        </p>
      )}
    </div>
  );
}
