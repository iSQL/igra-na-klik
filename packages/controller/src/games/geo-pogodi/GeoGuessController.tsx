import type { GeoControllerData, GeoHostData, GeoLeaderboardEntry } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { PhotoFrame } from '../../components/PhotoFrame';
import { PhotoSubmitter } from './PhotoSubmitter';
import { MapPinPicker } from './MapPinPicker';
import { SerbiaMap } from './components/SerbiaMap';

export default function GeoGuessController() {
  const gameState = useGameStore((s) => s.gameState);
  const player = usePlayerStore((s) => s.player);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);
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
    // Hostless room: no TV — show the round photo full-screen on the phone.
    const imageUrl = host?.currentRound?.location.imageUrl;
    if (hostless && imageUrl) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '0.75rem',
            gap: '0.5rem',
          }}
        >
          <PhotoFrame imageUrl={imageUrl} />
          <p
            style={{
              textAlign: 'center',
              fontSize: '0.9rem',
              color: 'var(--text-secondary)',
              margin: 0,
              flexShrink: 0,
            }}
          >
            Mapa stiže za {timeRemaining}s
          </p>
        </div>
      );
    }
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
        photoUrl={hostless ? host?.currentRound?.location.imageUrl : undefined}
      />
    );
  }

  if (phase === 'reveal') {
    // Hostless room: render the TV's reveal map (everyone's pins + the
    // true location) plus per-player distances — all public host data.
    if (hostless && host?.revealPins && host.truePinSvg) {
      return (
        <HostlessReveal
          host={host}
          myPlayerId={playerId}
          timeRemaining={timeRemaining}
        />
      );
    }
    return <RevealStatus myData={myData} timeRemaining={timeRemaining} />;
  }

  if (phase === 'final-leaderboard' || phase === 'ended') {
    if (hostless && host?.finalLeaderboard) {
      return (
        <HostlessLeaderboard
          title="Konačni poredak"
          entries={host.finalLeaderboard}
          myPlayerId={playerId}
        />
      );
    }
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

function HostlessReveal({
  host,
  myPlayerId,
  timeRemaining,
}: {
  host: GeoHostData;
  myPlayerId: string;
  timeRemaining: number;
}) {
  const markers = [
    ...(host.revealPins ?? []).map((p) => ({
      x: p.pin.x,
      y: p.pin.y,
      color: p.color,
    })),
    ...(host.truePinSvg
      ? [{ ...host.truePinSvg, color: '#ffd700', isTrue: true }]
      : []),
  ];
  const results = host.roundResults ?? [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '0.75rem 0',
        gap: '0.5rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 1rem',
        }}
      >
        <p style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
          ⭐ Tačna lokacija
        </p>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {timeRemaining}s
        </span>
      </div>
      <SerbiaMap disabled markers={markers} maxHeightCss="46dvh" />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
          padding: '0 1rem',
        }}
      >
        {results.map((r) => {
          const isMe = r.playerId === myPlayerId;
          return (
            <div
              key={r.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.4rem 0.7rem',
                background: isMe ? 'var(--bg-card)' : 'var(--bg-secondary)',
                borderRadius: '0.5rem',
                borderLeft: `4px solid ${r.avatarColor}`,
                outline: isMe ? '1px solid var(--accent)' : undefined,
                fontSize: '0.85rem',
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontWeight: isMe ? 700 : 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.name}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {r.distanceKm === null
                  ? 'bez pina'
                  : r.distanceKm < 1
                    ? `${Math.round(r.distanceKm * 1000)} m`
                    : `${r.distanceKm.toFixed(1)} km`}
              </span>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                +{r.pointsAwarded}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
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
