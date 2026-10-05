import type { ReactNode } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { SpectatorCanvas } from '../draw-guess/components/SpectatorCanvas';
import { GameFrame } from '../../components/kit/GameFrame';
import { RoundVerdict, verdictWash } from '../../components/kit/RoundVerdict';
import { FakeArtistPad } from './FakeArtistPad';
import type { FakeArtistControllerData, FakeArtistHostData } from '@igra/shared';

function emit(action: string, data: Record<string, unknown>) {
  socket.emit('game:player-action', { action, data });
}

/** Mirror the server's phase lengths — they only drive the drain bar. */
const PHASE_SECONDS: Record<string, number> = {
  drawing: 20,
  voting: 40,
  'fake-guess': 20,
};

/** "Ti si lažnjak" is the one red screen; getting caught is a moment. */
const CAUGHT_BG =
  'radial-gradient(600px 400px at 50% 0%, rgba(224,106,94,.45), transparent 70%), #5a2420';

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '0.8rem',
  textAlign: 'center',
  padding: '1rem 0',
};

const eyebrow: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
};

export default function FakeArtistController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as FakeArtistHostData;
  const my = playerData[playerId] as unknown as FakeArtistControllerData | undefined;
  const caught = phase === 'fake-guess' && my?.role === 'fake' && !!my.guessOptions && !my.hasGuessed;
  const timed = phase in PHASE_SECONDS;

  let subtitle: string | undefined;
  if (phase === 'drawing') subtitle = `Potez ${host.turnNumber}/${host.totalTurns}`;
  else if (phase === 'voting') subtitle = 'Glasanje';
  else if (phase === 'ended') subtitle = 'Kraj igre';

  return (
    <>
      {caught && (
        <div
          aria-hidden
          style={{ position: 'fixed', inset: 0, background: CAUGHT_BG, pointerEvents: 'none' }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        <GameFrame
          gameId="fake-artist"
          subtitle={subtitle}
          timeRemaining={timed ? timeRemaining : undefined}
          timeTotal={PHASE_SECONDS[phase]}
          roundKey={phase === 'drawing' && my?.isMyTurn ? host.turnNumber : undefined}
        >
          <Body playerId={playerId} />
        </GameFrame>
      </div>
    </>
  );
}

function Body({ playerId }: { playerId: string }) {
  const gameState = useGameStore((s) => s.gameState)!;
  const myColor = usePlayerStore((s) => s.player?.avatarColor) ?? '#000000';
  const roster = usePlayerStore((s) => s.room?.players ?? []);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  const { phase, data, playerData } = gameState;
  const host = data.host as FakeArtistHostData;
  const my = playerData[playerId] as unknown as FakeArtistControllerData | undefined;
  const role = my?.role ?? 'spectator';

  // --- reveal-role ------------------------------------------------------
  if (phase === 'reveal-role') {
    if (role === 'spectator') {
      return (
        <div style={wrap}>
          <span style={{ fontSize: '2.6rem' }}>👀</span>
          <p className="display" style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
            Gledaj rundu — uključuješ se sledeće!
          </p>
        </div>
      );
    }
    const fake = role === 'fake';
    // Same card either way — from across the room only the band's colour differs.
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: 16 }}>
        <div
          style={{
            flex: 1,
            borderRadius: 28,
            background: 'var(--text-primary)',
            color: '#1D3557',
            borderTop: `10px solid ${fake ? 'var(--danger)' : 'var(--accent)'}`,
            boxShadow: '0 20px 40px rgba(0,0,0,.25)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: 24,
            textAlign: 'center',
            animation: 'igra-flip-in .4s ease-out',
          }}
        >
          <span style={{ fontSize: '3.6rem', lineHeight: 1 }}>{fake ? '🎭' : '🎨'}</span>
          <span
            className="display"
            style={{ fontWeight: 800, fontSize: '2rem', lineHeight: 1, color: fake ? '#b8483d' : '#8a6a24' }}
          >
            {fake ? 'Ti si LAŽNI UMETNIK' : 'Ti si umetnik'}
          </span>
          {fake ? (
            <>
              <span style={{ marginTop: 10, fontSize: '0.95rem', fontWeight: 700, color: '#6b6458' }}>
                Ne znaš reč! Kategorija:
              </span>
              <span className="display" style={{ fontWeight: 800, fontSize: '1.85rem', lineHeight: 1 }}>
                {my?.category}
              </span>
              <span style={{ marginTop: 14, fontSize: '0.95rem', lineHeight: 1.45, color: '#4a5568' }}>
                Blefiraj — nacrtaj nešto uverljivo da te ne provale.
              </span>
            </>
          ) : (
            <>
              <span style={{ marginTop: 10, fontSize: '0.95rem', fontWeight: 700, color: '#6b6458' }}>
                {my?.category}
              </span>
              <span
                className="display"
                style={{
                  fontWeight: 800,
                  fontSize: '2.4rem',
                  lineHeight: 1,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {my?.secretWord}
              </span>
              <span style={{ marginTop: 14, fontSize: '0.95rem', lineHeight: 1.45, color: '#4a5568' }}>
                Nacrtaj samo jedan potez — ne oduzmi previše da uljez ne pogodi reč!
              </span>
            </>
          )}
        </div>
        <span
          style={{
            marginTop: 14,
            textAlign: 'center',
            fontSize: '0.82rem',
            fontWeight: 700,
            color: 'var(--dim)',
          }}
        >
          Nikome ne pokazuj ekran
        </span>
      </div>
    );
  }

  // --- drawing ----------------------------------------------------------
  if (phase === 'drawing') {
    const secret =
      role === 'artist' ? (
        <span style={{ color: 'var(--amber)' }}>{my?.secretWord}</span>
      ) : role === 'fake' ? (
        <span style={{ color: 'var(--danger)' }}>{my?.category}</span>
      ) : null;

    if (my?.isMyTurn) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: 10, gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <span style={eyebrow}>
              Tvoj potez · {host.turnNumber}/{host.totalTurns}
            </span>
            <span
              className="display"
              style={{
                fontWeight: 800,
                fontSize: '1.75rem',
                lineHeight: 1.05,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {secret}
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <FakeArtistPad
              operations={host.operations}
              color={myColor}
              legend={<Legend roster={roster} me={playerId} />}
              onSubmit={(points) => emit('fake:submit-stroke', { points })}
            />
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: 14, gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <span style={eyebrow}>
            Crta: {host.currentDrawerName} · Potez {host.turnNumber}/{host.totalTurns}
          </span>
          {secret && (
            <span
              className="display"
              style={{ fontWeight: 800, fontSize: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}
            >
              {secret}
            </span>
          )}
        </div>
        {hostless ? (
          <>
            <SpectatorCanvas operations={host.operations} />
            <Legend roster={roster} me={playerId} />
          </>
        ) : (
          <div style={{ ...wrap, flex: 1 }}>
            <span style={{ fontSize: '2.4rem' }}>📺</span>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>
              Gledaj crtež na TV-u
            </p>
          </div>
        )}
      </div>
    );
  }

  // --- voting -----------------------------------------------------------
  if (phase === 'voting') {
    if (!my?.canVote) {
      return (
        <div style={wrap}>
          <span style={{ fontSize: '2.4rem' }}>🗳️</span>
          <p className="display" style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
            Ostali glasaju ko je lažnjak…
          </p>
        </div>
      );
    }
    const votedName = my.voteOptions?.find((o) => o.playerId === my.votedFor)?.name;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: 14 }}>
        <span className="display" style={{ fontWeight: 700, fontSize: '1.9rem', lineHeight: 1.05 }}>
          Ko je lažni umetnik?
        </span>
        <div
          style={{
            marginTop: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            overflowY: 'auto',
            minHeight: 0,
          }}
        >
          {my.voteOptions?.map((o) => {
            const picked = my.votedFor === o.playerId;
            const emoji = roster.find((p) => p.id === o.playerId)?.avatarEmoji;
            return (
              <button
                key={o.playerId}
                onClick={() => !my.hasVoted && emit('fake:vote', { suspectId: o.playerId })}
                disabled={my.hasVoted}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 60,
                  padding: '0 12px',
                  borderRadius: 16,
                  border: `1.5px solid ${picked ? 'var(--accent)' : 'transparent'}`,
                  background: picked ? 'var(--accent)' : 'rgba(245,235,224,.05)',
                  color: picked ? 'var(--bg-primary)' : 'var(--text-primary)',
                  opacity: my.hasVoted && !picked ? 0.55 : 1,
                  textAlign: 'left',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '30%',
                    background: o.avatarColor,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '1.25rem',
                    flexShrink: 0,
                  }}
                >
                  {emoji}
                </span>
                <span style={{ flex: 1, fontSize: '1rem', fontWeight: 800 }}>{o.name}</span>
                {picked && <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>✓</span>}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <span
          style={{
            marginTop: 12,
            textAlign: 'center',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: 'var(--dim)',
          }}
        >
          {my.hasVoted && votedName ? `Glasao si za ${votedName} · ` : ''}
          {host.votedCount}/{host.totalVoters} glasalo
        </span>
      </div>
    );
  }

  // --- fake-guess -------------------------------------------------------
  if (phase === 'fake-guess') {
    if (role === 'fake' && my?.guessOptions) {
      if (my.hasGuessed) {
        return (
          <div style={wrap}>
            <span style={{ fontSize: '2.4rem' }}>🤞</span>
            <p className="display" style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
              Poslao si pogodak — čekamo…
            </p>
          </div>
        );
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingTop: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
            <span style={{ fontSize: '3.2rem', lineHeight: 1 }}>🎭</span>
            <span className="display" style={{ fontWeight: 800, fontSize: '2.2rem', lineHeight: 1 }}>
              Provaljen si!
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, opacity: 0.9 }}>
              Pogodi reč da spaseš poene
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flexShrink: 0 }}>
            {my.guessOptions.map((w) => (
              <button
                key={w}
                className="display"
                onClick={() => emit('fake:guess-word', { word: w })}
                style={{
                  minHeight: 72,
                  borderRadius: 18,
                  border: 'none',
                  background: 'var(--text-primary)',
                  color: 'var(--bg-primary)',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  padding: '0 8px',
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
        <span style={{ fontSize: '2.6rem' }}>🎭</span>
        <p className="display" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          Uhvaćen je lažnjak!
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
          Pokušava da pogodi reč…
        </p>
      </div>
    );
  }

  // --- results ----------------------------------------------------------
  if (phase === 'results') {
    const roundScore = my?.ownRoundScore ?? 0;
    const won = roundScore > 0;
    return (
      <div style={{ ...wrap, background: verdictWash(won ? 'correct' : 'wrong') }}>
        <RoundVerdict
          kind={won ? 'correct' : 'wrong'}
          icon="🎭"
          title={
            host.fakeCaught
              ? host.fakeGuessCorrect
                ? 'Uhvaćen, ali je pogodio!'
                : 'Uhvaćen!'
              : 'Lažnjak je pobegao!'
          }
          points={roundScore}
        />
        <p style={{ fontSize: '1rem', margin: 0 }}>
          Lažnjak: <strong>{host.fakeArtistName}</strong> · reč:{' '}
          <strong style={{ color: 'var(--amber)' }}>{host.word}</strong>
        </p>
      </div>
    );
  }

  // --- ended ------------------------------------------------------------
  if (phase === 'ended') {
    const entry = host.leaderboard?.find((e) => e.playerId === playerId);
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>Konačni plasman</p>
        {entry && (
          <>
            <p className="display" style={{ fontSize: '3.4rem', fontWeight: 800, color: 'var(--amber)', margin: 0 }}>
              #{entry.rank}
            </p>
            <p style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>
              {entry.score.toLocaleString()} poena
            </p>
          </>
        )}
      </div>
    );
  }

  return null;
}

/** Colour legend under the canvas — every player draws in their avatar colour. */
function Legend({
  roster,
  me,
}: {
  roster: { id: string; name: string; avatarColor: string }[];
  me: string;
}): ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        fontSize: '0.75rem',
        fontWeight: 800,
        color: 'var(--text-secondary)',
        flexShrink: 0,
      }}
    >
      {roster.map((p) => (
        <span
          key={p.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: p.id === me ? 'var(--text-primary)' : undefined,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: p.avatarColor,
              boxShadow: p.id === me ? '0 0 0 2px var(--text-primary)' : 'none',
            }}
          />
          {p.id === me ? 'Ti' : p.name}
        </span>
      ))}
    </div>
  );
}
