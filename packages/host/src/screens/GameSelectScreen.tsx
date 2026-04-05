import { GAME_DEFINITIONS } from '@igra/shared';
import { socket } from '../socket';
import { useRoomStore } from '../store/roomStore';
import { useQuizImportStore } from '../store/quizImportStore';
import { QuizImportButton } from '../components/QuizImportButton';

export function GameSelectScreen() {
  const setStatus = useRoomStore((s) => s.setStatus);
  const games = Object.values(GAME_DEFINITIONS);

  const handleSelect = (gameId: string) => {
    const customQuestions =
      gameId === 'quiz'
        ? useQuizImportStore.getState().customQuestions ?? undefined
        : undefined;
    socket.emit('host:start-game', { gameId, customQuestions });
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
      }}
    >
      <h1 style={{ fontSize: '2rem' }}>Choose a Game</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1.5rem',
          width: '100%',
        }}
      >
        {games.map((game) => (
          <div
            key={game.id}
            role="button"
            tabIndex={0}
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
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.transform = 'scale(1.03)';
            }}
            onMouseLeave={(e) => {
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
                color: 'var(--text-secondary)',
              }}
            >
              {game.minPlayers}-{game.maxPlayers} players
            </p>
            {game.id === 'quiz' && <QuizImportButton />}
          </div>
        ))}
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
