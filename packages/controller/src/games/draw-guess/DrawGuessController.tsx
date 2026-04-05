import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { WordPicker } from './components/WordPicker';
import { DrawingPad } from './components/DrawingPad';
import { GuessingInput } from './components/GuessingInput';
import type { DrawGuessHostData, DrawGuessLeaderboardEntry } from '@igra/shared';

export default function DrawGuessController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const myData = playerData[playerId] as
    | { isDrawer: boolean; wordChoices?: string[]; hasGuessedCorrectly?: boolean }
    | undefined;
  const host = data.host as DrawGuessHostData;
  const isDrawer = myData?.isDrawer ?? false;

  // Choosing word phase — only drawer picks
  if (phase === 'choosing-word') {
    if (isDrawer && myData?.wordChoices) {
      return (
        <WordPicker
          words={myData.wordChoices}
          onPick={(index) => {
            socket.emit('game:player-action', {
              action: 'draw:choose-word',
              data: { wordIndex: index },
            });
          }}
        />
      );
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1rem',
          textAlign: 'center',
          padding: '1rem',
        }}
      >
        <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>
          {host.drawerName} bira reč...
        </p>
        <p style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>
          {timeRemaining}s
        </p>
      </div>
    );
  }

  // Drawing phase
  if (phase === 'drawing') {
    if (isDrawer) {
      return <DrawingPad timeRemaining={timeRemaining} />;
    }

    return (
      <GuessingInput
        hasGuessedCorrectly={myData?.hasGuessedCorrectly ?? false}
        hint={host.wordHint}
        timeRemaining={timeRemaining}
      />
    );
  }

  // Turn results
  if (phase === 'turn-results') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1rem',
          textAlign: 'center',
          padding: '1rem',
        }}
      >
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Reč je bila</p>
        <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>
          {host.revealedWord}
        </p>
      </div>
    );
  }

  // Leaderboard / ended
  if ((phase === 'leaderboard' || phase === 'ended') && data.leaderboard) {
    const leaderboard = data.leaderboard as DrawGuessLeaderboardEntry[];
    const myEntry = leaderboard.find((e) => e.playerId === playerId);

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1rem',
          textAlign: 'center',
        }}
      >
        {myEntry && (
          <>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
              {phase === 'ended' ? 'Konačno mesto' : 'Tvoje mesto'}
            </p>
            <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)' }}>
              #{myEntry.rank}
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              {myEntry.score.toLocaleString()} poena
            </p>
          </>
        )}
      </div>
    );
  }

  return null;
}
