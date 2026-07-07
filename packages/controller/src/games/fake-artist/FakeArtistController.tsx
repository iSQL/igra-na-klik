import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { SpectatorCanvas } from '../draw-guess/components/SpectatorCanvas';
import { FakeArtistPad } from './FakeArtistPad';
import type {
  FakeArtistControllerData,
  FakeArtistHostData,
} from '@igra/shared';

function emit(action: string, data: Record<string, unknown>) {
  socket.emit('game:player-action', { action, data });
}

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '1rem',
  textAlign: 'center',
  padding: '1rem',
};

export default function FakeArtistController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const myColor = usePlayerStore((s) => s.player?.avatarColor) ?? '#000000';
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as FakeArtistHostData;
  const my = playerData[playerId] as unknown as
    | FakeArtistControllerData
    | undefined;
  const role = my?.role ?? 'spectator';

  // --- reveal-role ------------------------------------------------------
  if (phase === 'reveal-role') {
    if (role === 'fake') {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '2.4rem' }}>🎭</p>
          <p style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--danger)' }}>
            Ti si LAŽNI UMETNIK
          </p>
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
            Ne znaš reč! Kategorija:
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{my?.category}</p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Blefiraj — nacrtaj nešto uverljivo da te ne provale.
          </p>
        </div>
      );
    }
    if (role === 'artist') {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '2.4rem' }}>🎨</p>
          <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>Ti si umetnik</p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            Reč koju crtate:
          </p>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>
            {my?.secretWord}
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Kategorija: {my?.category}
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Nacrtaj samo jedan potez — ne oduzmi previše da uljez ne pogodi reč!
          </p>
        </div>
      );
    }
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1.2rem' }}>Gledaj rundu — uključuješ se sledeće!</p>
      </div>
    );
  }

  // --- drawing ----------------------------------------------------------
  if (phase === 'drawing') {
    if (my?.isMyTurn) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            padding: '0.5rem',
            gap: '0.4rem',
          }}
        >
          <p
            style={{
              fontSize: '1rem',
              fontWeight: 800,
              textAlign: 'center',
              margin: 0,
            }}
          >
            Tvoj potez!{' '}
            {role === 'artist' ? (
              <span style={{ color: 'var(--accent)' }}>{my?.secretWord}</span>
            ) : (
              <span style={{ color: 'var(--danger)' }}>({my?.category})</span>
            )}
          </p>
          <div style={{ flex: 1, minHeight: 0 }}>
            <FakeArtistPad
              operations={host.operations}
              color={myColor}
              timeRemaining={timeRemaining}
              onSubmit={(points) => emit('fake:submit-stroke', { points })}
            />
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          padding: '0.75rem',
          gap: '0.6rem',
          alignItems: 'center',
        }}
      >
        <p style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
          Crta: {host.currentDrawerName}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
          Potez {host.turnNumber}/{host.totalTurns} · {timeRemaining}s
          {role === 'artist' && (
            <>
              {' '}
              · reč: <strong>{my?.secretWord}</strong>
            </>
          )}
        </p>
        {hostless && <SpectatorCanvas operations={host.operations} />}
        {!hostless && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Gledaj crtež na TV-u 👀
          </p>
        )}
      </div>
    );
  }

  // --- voting -----------------------------------------------------------
  if (phase === 'voting') {
    if (!my?.canVote) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.2rem' }}>Ostali glasaju ko je lažnjak...</p>
        </div>
      );
    }
    if (my.hasVoted) {
      const votedName = my.voteOptions?.find(
        (o) => o.playerId === my.votedFor
      )?.name;
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.1rem' }}>Glasao si za</p>
          <p style={{ fontSize: '1.8rem', fontWeight: 800 }}>{votedName}</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {host.votedCount}/{host.totalVoters} glasalo
          </p>
        </div>
      );
    }
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          padding: '1rem',
          gap: '0.75rem',
        }}
      >
        <p style={{ fontSize: '1.3rem', fontWeight: 800, textAlign: 'center' }}>
          Ko je lažni umetnik?
        </p>
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            margin: 0,
          }}
        >
          {timeRemaining}s
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            overflowY: 'auto',
          }}
        >
          {my.voteOptions?.map((o) => (
            <button
              key={o.playerId}
              onClick={() => emit('fake:vote', { suspectId: o.playerId })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                border: 'none',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontWeight: 700,
                fontSize: '1.05rem',
                borderLeft: `6px solid ${o.avatarColor}`,
              }}
            >
              {o.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- fake-guess -------------------------------------------------------
  if (phase === 'fake-guess') {
    if (role === 'fake' && my?.guessOptions) {
      if (my.hasGuessed) {
        return (
          <div style={wrap}>
            <p style={{ fontSize: '1.2rem' }}>Poslao si pogodak — čekamo...</p>
          </div>
        );
      }
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            padding: '1rem',
            gap: '0.75rem',
          }}
        >
          <p style={{ fontSize: '1.3rem', fontWeight: 800, textAlign: 'center' }}>
            Provaljen si! 🎭
          </p>
          <p
            style={{
              fontSize: '0.95rem',
              color: 'var(--text-secondary)',
              textAlign: 'center',
              margin: 0,
            }}
          >
            Pogodi reč da spaseš poene ({timeRemaining}s)
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.5rem',
            }}
          >
            {my.guessOptions.map((w) => (
              <button
                key={w}
                onClick={() => emit('fake:guess-word', { word: w })}
                style={{
                  padding: '1rem 0.5rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '1.05rem',
                }}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1.2rem' }}>
          Uhvaćen je lažnjak! Pokušava da pogodi reč...
        </p>
      </div>
    );
  }

  // --- results ----------------------------------------------------------
  if (phase === 'results') {
    const iAmFake = role === 'fake';
    const roundScore = my?.ownRoundScore ?? 0;
    return (
      <div style={wrap}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Lažni umetnik je bio
        </p>
        <p style={{ fontSize: '1.6rem', fontWeight: 800 }}>
          🎭 {host.fakeArtistName}
        </p>
        <p style={{ fontSize: '1rem' }}>
          Reč: <strong style={{ color: 'var(--accent)' }}>{host.word}</strong>
        </p>
        <p
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            color: host.fakeCaught ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {host.fakeCaught
            ? host.fakeGuessCorrect
              ? `Uhvaćen, ali je pogodio reč (${host.fakeGuess})!`
              : 'Uhvaćen!'
            : 'Lažnjak je pobegao!'}
        </p>
        <p
          style={{
            fontSize: '1.3rem',
            fontWeight: 800,
            color: roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
          }}
        >
          {iAmFake ? '🎭 ' : ''}
          {roundScore > 0 ? `+${roundScore}` : '+0'} poena
        </p>
      </div>
    );
  }

  // --- ended ------------------------------------------------------------
  if (phase === 'ended') {
    const entry = host.leaderboard?.find((e) => e.playerId === playerId);
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Konačni plasman
        </p>
        {entry && (
          <>
            <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)' }}>
              #{entry.rank}
            </p>
            <p style={{ fontSize: '1.4rem', fontWeight: 600 }}>
              {entry.score.toLocaleString()} poena
            </p>
          </>
        )}
      </div>
    );
  }

  return null;
}
