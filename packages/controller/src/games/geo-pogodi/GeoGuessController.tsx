import type { GeoControllerData, GeoHostData, GeoLeaderboardEntry } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { PhotoSubmitter } from './PhotoSubmitter';
import { MapPinPicker } from './MapPinPicker';

export default function GeoGuessController() {
  const gameState = useGameStore((s) => s.gameState);
  const player = usePlayerStore((s) => s.player);
  const playerId = player?.id;

  if (!gameState || !playerId) return <Centered message="Učitavanje..." />;

  const { phase, timeRemaining, data, playerData } = gameState;
  const myData = playerData[playerId] as unknown as GeoControllerData | undefined;
  const host = data.host as GeoHostData | undefined;
  const ownColor = player?.avatarColor;

  if (!myData) return <Centered message="Učitavanje..." />;

  if (phase === 'submission') {
    if (myData.role !== 'submitter') {
      return <Centered message="Samo posmatraš ovu rundu submisije..." />;
    }
    return (
      <PhotoSubmitter
        photosNeeded={myData.photosNeeded ?? 0}
        photosSubmitted={myData.photosSubmitted ?? 0}
        ownColor={ownColor}
      />
    );
  }

  if (phase === 'intro') {
    return (
      <Centered>
        <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>{host?.packName ?? 'Pogodi gde je'}</p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          {host?.totalRounds ?? '?'} rundi — pripremi se!
        </p>
      </Centered>
    );
  }

  if (phase === 'viewing') {
    return (
      <Centered>
        <p style={{ fontSize: '1.05rem', fontWeight: 600 }}>Pogledaj sliku na ekranu</p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Mapa stiže za {timeRemaining}s
        </p>
      </Centered>
    );
  }

  if (phase === 'placing') {
    if (myData.isOwnPhoto) {
      return (
        <Centered>
          <p style={{ fontSize: '1.05rem', fontWeight: 600 }}>Tvoja slika</p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Sačekaj ostale da pogode...
          </p>
          <p
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: timeRemaining <= 5 ? 'var(--danger)' : 'var(--text-primary)',
            }}
          >
            {timeRemaining}s
          </p>
        </Centered>
      );
    }
    return (
      <MapPinPicker
        timeRemaining={timeRemaining}
        hasLocked={myData.hasLocked === true}
        ownPin={myData.ownPin}
        ownColor={ownColor}
      />
    );
  }

  if (phase === 'reveal') {
    return <RevealStatus myData={myData} timeRemaining={timeRemaining} />;
  }

  if (phase === 'final-leaderboard' || phase === 'ended') {
    const entry = host?.finalLeaderboard?.find(
      (e: GeoLeaderboardEntry) => e.playerId === playerId
    );
    return (
      <Centered>
        {entry ? (
          <>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              Konačno mesto
            </p>
            <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)' }}>
              #{entry.rank}
            </p>
            <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>
              {entry.score.toLocaleString('sr-Latn-RS')} poena
            </p>
          </>
        ) : (
          <p style={{ fontSize: '1.1rem' }}>Konačni poredak na velikom ekranu</p>
        )}
      </Centered>
    );
  }

  return <Centered message="Učitavanje..." />;
}

function RevealStatus({
  myData,
  timeRemaining,
}: {
  myData: GeoControllerData;
  timeRemaining: number;
}) {
  if (myData.ownPoints === undefined && myData.ownDistanceKm === undefined) {
    return (
      <Centered>
        <p style={{ fontSize: '1rem' }}>Otkriva se na velikom ekranu...</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{timeRemaining}s</p>
      </Centered>
    );
  }

  const km = myData.ownDistanceKm;
  const points = myData.ownPoints ?? 0;

  return (
    <Centered>
      {km !== undefined ? (
        <>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Promašaj
          </p>
          <p style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}
          </p>
          <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent)' }}>
            +{points} poena
          </p>
          {myData.ownRoundRank && (
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {myData.ownRoundRank === 1 ? '🏆 Najbolji u rundi!' : `#${myData.ownRoundRank} u rundi`}
            </p>
          )}
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Ukupno: {(myData.totalScore ?? 0).toLocaleString('sr-Latn-RS')}
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: '1rem' }}>Nisi postavio iglu</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>0 poena</p>
        </>
      )}
    </Centered>
  );
}

function Centered({
  message,
  children,
}: {
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '0.7rem',
        padding: '1rem',
        textAlign: 'center',
      }}
    >
      {children ?? (
        <p style={{ fontSize: '1.15rem', fontWeight: 600 }}>{message}</p>
      )}
    </div>
  );
}
