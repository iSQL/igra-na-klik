import { useEffect, useState } from 'react';
import { GAME_DEFINITIONS } from '@igra/shared';
import { socket } from '../socket';
import { useRoomStore } from '../store/roomStore';
import { useQuizImportStore } from '../store/quizImportStore';
import { useSlepiConfigStore } from '../store/slepiConfigStore';
import { useGeoConfigStore } from '../store/geoConfigStore';
import { QuizImportButton } from '../components/QuizImportButton';
import { GeoPackButton } from '../components/GeoPackButton';

const SLEPI_ROUND_OPTIONS = [1, 2, 3, 4];

export function GameSelectScreen() {
  const setStatus = useRoomStore((s) => s.setStatus);
  const players = useRoomStore((s) => s.players);
  const games = Object.values(GAME_DEFINITIONS);
  const selectedRounds = useSlepiConfigStore((s) => s.selectedRounds);
  const setSelectedRounds = useSlepiConfigStore((s) => s.setSelectedRounds);
  const connectedCount = players.filter((p) => p.isConnected).length;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const onError = ({ message }: { message: string }) => {
      setErrorMessage(message);
    };
    socket.on('error', onError);
    return () => {
      socket.off('error', onError);
    };
  }, []);

  useEffect(() => {
    if (!errorMessage) return;
    const handle = setTimeout(() => setErrorMessage(null), 6000);
    return () => clearTimeout(handle);
  }, [errorMessage]);

  const handleSelect = (gameId: string) => {
    const def = GAME_DEFINITIONS[gameId];
    if (def && connectedCount < def.minPlayers) return;

    const customQuestions =
      gameId === 'quiz'
        ? useQuizImportStore.getState().customQuestions ?? undefined
        : undefined;
    const slepiRounds =
      gameId === 'slepi-telefoni' ? selectedRounds : undefined;

    let geoPackId: string | undefined;
    let geoMode: 'predefined' | 'custom' | undefined;
    let customPhotosPerPlayer: number | undefined;
    if (gameId === 'geo-pogodi' || gameId === 'foto-kviz') {
      const geo = useGeoConfigStore.getState();
      geoMode = geo.mode;
      if (geo.mode === 'predefined') {
        geoPackId = geo.selectedPackId ?? undefined;
      } else {
        customPhotosPerPlayer = geo.customPhotosPerPlayer;
      }
    }

    socket.emit('host:start-game', {
      gameId,
      customQuestions,
      slepiRounds,
      geoPackId,
      geoMode,
      customPhotosPerPlayer,
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        padding: '2rem',
        width: '100%',
        maxWidth: '800px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <h1 style={{ fontSize: '2rem' }}>Choose a Game</h1>

      {errorMessage && (
        <div
          role="alert"
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            background: 'rgba(231, 76, 60, 0.15)',
            border: '1px solid #e74c3c',
            borderRadius: '0.5rem',
            color: '#ffb1ab',
            fontSize: '0.95rem',
            textAlign: 'center',
          }}
        >
          {errorMessage}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1.5rem',
          width: '100%',
        }}
      >
        {games.map((game) => {
          const lacking = connectedCount < game.minPlayers;
          return (
          <div
            key={game.id}
            role="button"
            tabIndex={lacking ? -1 : 0}
            aria-disabled={lacking}
            onClick={() => handleSelect(game.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelect(game.id);
              }
            }}
            style={{
              padding: '1.5rem',
              background: 'var(--bg-card)',
              borderRadius: '1rem',
              textAlign: 'center',
              transition: 'transform 0.15s, background 0.15s',
              color: 'var(--text-primary)',
              cursor: lacking ? 'not-allowed' : 'pointer',
              opacity: lacking ? 0.45 : 1,
            }}
            onMouseEnter={(e) => {
              if (lacking) return;
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.transform = 'scale(1.03)';
            }}
            onMouseLeave={(e) => {
              if (lacking) return;
              e.currentTarget.style.background = 'var(--bg-card)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>
              {game.name}
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {game.description}
            </p>
            <p
              style={{
                fontSize: '0.8rem',
                marginTop: '0.5rem',
                color: lacking ? '#e07070' : 'var(--text-secondary)',
              }}
            >
              {lacking
                ? `Treba još ${game.minPlayers - connectedCount} ${
                    game.minPlayers - connectedCount === 1 ? 'igrač' : 'igrača'
                  }`
                : `${game.minPlayers}-${game.maxPlayers} players`}
            </p>
            {game.id === 'quiz' && <QuizImportButton />}
            {(game.id === 'geo-pogodi' || game.id === 'foto-kviz') && <GeoPackButton />}
            {game.id === 'slepi-telefoni' && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  marginTop: '0.75rem',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {SLEPI_ROUND_OPTIONS.map((n) => {
                  const active = n === selectedRounds;
                  return (
                    <button
                      key={n}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRounds(n);
                      }}
                      style={{
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        borderRadius: '6px',
                        background: active
                          ? 'var(--accent)'
                          : 'var(--bg-secondary)',
                        color: active ? '#fff' : 'var(--text-primary)',
                        minWidth: '36px',
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          );
        })}
      </div>

      <button
        onClick={() => setStatus('lobby')}
        style={{
          padding: '0.75rem 2rem',
          fontSize: '1rem',
          borderRadius: '0.75rem',
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
        }}
      >
        Back to Lobby
      </button>
    </div>
  );
}
