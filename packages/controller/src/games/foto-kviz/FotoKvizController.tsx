import type {
  FotoKvizControllerData,
  FotoKvizHostData,
  GeoLeaderboardEntry,
} from '@igra/shared';
import { socket } from '../../socket';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { AnswerButtons } from './components/AnswerButtons';
import { FotoKvizPhotoSubmitter } from './FotoKvizPhotoSubmitter';

export default function FotoKvizController() {
  const gameState = useGameStore((s) => s.gameState);
  const player = usePlayerStore((s) => s.player);
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
    return <ResultsStatus myData={myData} />;
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
          <p style={{ fontSize: '1.6rem', fontWeight: 700, color: '#7be37b' }}>
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
