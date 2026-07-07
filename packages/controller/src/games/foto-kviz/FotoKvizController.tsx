import type {
  FotoKvizControllerData,
  FotoKvizHostData,
  GeoLeaderboardEntry,
} from '@igra/shared';
import { socket } from '../../socket';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { PhotoFrame } from '../../components/PhotoFrame';
import { AnswerButtons } from './components/AnswerButtons';
import { FotoKvizPhotoSubmitter } from './FotoKvizPhotoSubmitter';

export default function FotoKvizController() {
  const gameState = useGameStore((s) => s.gameState);
  const player = usePlayerStore((s) => s.player);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);
  const playerId = player?.id;

  if (!gameState || !playerId) return <Centered message="Učitavanje..." />;

  const { phase, timeRemaining, data, playerData } = gameState;
  const myData = playerData[playerId] as unknown as
    | FotoKvizControllerData
    | undefined;
  const host = data.host as FotoKvizHostData | undefined;

  if (!myData) return <Centered message="Učitavanje..." />;

  if (phase === 'submission') {
    if (myData.role !== 'submitter') {
      return <Centered message="Samo posmatraš ovu submission fazu..." />;
    }
    return (
      <FotoKvizPhotoSubmitter
        photosNeeded={myData.photosNeeded ?? 0}
        photosSubmitted={myData.photosSubmitted ?? 0}
      />
    );
  }

  if (phase === 'intro') {
    return (
      <Centered>
        <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>
          {host?.packName ?? 'Foto kviz'}
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          {host?.totalRounds ?? '?'} rundi — pripremi se!
        </p>
      </Centered>
    );
  }

  if (phase === 'showing-photo') {
    // Hostless room: the photo lives only on the TV otherwise — show it
    // full-screen on the phone. imageUrl is public round data (either a
    // same-origin /geo-images URL or a base64 custom photo).
    const imageUrl = host?.currentRound?.question.imageUrl;
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
            Odgovori stižu za {timeRemaining}s
          </p>
        </div>
      );
    }
    return (
      <Centered>
        <p style={{ fontSize: '1.05rem', fontWeight: 600 }}>
          Pogledaj sliku na ekranu
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Odgovori stižu za {timeRemaining}s
        </p>
      </Centered>
    );
  }

  if (phase === 'answering') {
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

    const options = host?.currentRound?.question.options ?? [];
    const lowTime = timeRemaining <= 5;
    const answeringImageUrl = host?.currentRound?.question.imageUrl;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: '1rem',
          gap: '0.75rem',
        }}
      >
        {hostless && answeringImageUrl && (
          <div style={{ flexShrink: 0, height: '28%', minHeight: 0 }}>
            <PhotoFrame imageUrl={answeringImageUrl} />
          </div>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <p style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
            {myData.hasAnswered
              ? '✓ Odgovor poslat'
              : 'Tapni tačan odgovor'}
          </p>
          <span
            style={{
              fontSize: lowTime ? '1.4rem' : '1.05rem',
              fontWeight: 700,
              color: lowTime ? 'var(--danger)' : 'var(--text-primary)',
            }}
          >
            {timeRemaining}s
          </span>
        </div>
        <AnswerButtons
          options={options}
          onPick={(index) =>
            socket.emit('game:player-action', {
              action: 'foto:answer',
              data: { optionIndex: index },
            })
          }
          disabled={myData.hasAnswered === true}
          selectedIndex={myData.selectedIndex}
        />
        {myData.hasAnswered && (
          <p
            style={{
              textAlign: 'center',
              fontSize: '0.9rem',
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            Čekamo ostale...
          </p>
        )}
      </div>
    );
  }

  if (phase === 'showing-results') {
    // Hostless room: append the TV's reveal (correct answer + everyone's
    // answers) — host.roundResult is public data.
    const rr = host?.roundResult;
    if (hostless && rr) {
      const correctText =
        rr.question.options[rr.question.correctIndex]?.text ?? '?';
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            gap: '0.6rem',
            padding: '1rem',
            overflowY: 'auto',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            Tačan odgovor
          </p>
          <p
            style={{
              fontSize: '1.4rem',
              fontWeight: 800,
              color: 'var(--success)',
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {correctText}
          </p>
          {!myData.isOwnPhoto && (
            <p style={{ fontSize: '0.95rem', margin: '0.2rem 0' }}>
              {myData.ownCorrect ? '✅ Tačno!' : '❌ Netačno'} ·{' '}
              <strong style={{ color: 'var(--accent)' }}>
                +{myData.ownPoints ?? 0}
              </strong>
            </p>
          )}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              textAlign: 'left',
            }}
          >
            {rr.perPlayer.map((p) => (
              <div
                key={p.playerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.45rem 0.7rem',
                  background: 'var(--bg-card)',
                  borderRadius: '0.5rem',
                  borderLeft: `4px solid ${p.avatarColor}`,
                  fontSize: '0.85rem',
                }}
              >
                <span>{p.correct ? '✅' : '❌'}</span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                  }}
                >
                  {p.name}
                  {p.optionIndex === null && (
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                      {' '}
                      — bez odgovora
                    </span>
                  )}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                  +{p.pointsAwarded}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return <ResultsStatus myData={myData} />;
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

function ResultsStatus({ myData }: { myData: FotoKvizControllerData }) {
  if (myData.isOwnPhoto) {
    return (
      <Centered>
        <p style={{ fontSize: '1.05rem', fontWeight: 600 }}>Tvoja slika</p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Tačan odgovor: <strong>{myData.correctOptionText ?? '...'}</strong>
        </p>
      </Centered>
    );
  }

  const correct = myData.ownCorrect === true;
  const points = myData.ownPoints ?? 0;
  return (
    <Centered>
      {correct ? (
        <>
          <p style={{ fontSize: '2.2rem' }}>✓</p>
          <p style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--success)' }}>
            +{points} poena
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: '2.2rem' }}>✗</p>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)' }}>
            Tačan odgovor:
          </p>
          <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>
            {myData.correctOptionText ?? '...'}
          </p>
        </>
      )}
      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          marginTop: '0.5rem',
        }}
      >
        Ukupno: {(myData.totalScore ?? 0).toLocaleString('sr-Latn-RS')}
      </p>
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
