import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { useT } from '../../i18n/useT';
import { WordPicker } from './components/WordPicker';
import { DrawingPad } from './components/DrawingPad';
import { GuessingInput } from './components/GuessingInput';
import { HostlessGuessing } from './components/HostlessGuessing';
import type { DrawGuessHostData, DrawGuessLeaderboardEntry } from '@igra/shared';

export default function DrawGuessController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);
  const t = useT();

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
          {t('drawGuess.choosingWord', { name: host.drawerName })}
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
      return (
        <DrawingPad
          timeRemaining={timeRemaining}
          operations={host.operations}
        />
      );
    }

    // In a hostless room there is no TV showing the drawing — render a
    // half-width read-only copy of the canvas with the live feed of everyone's
    // guesses beside it, above the guess input.
    if (hostless) {
      return (
        <HostlessGuessing
          operations={host.operations}
          guesses={host.guesses}
          hint={host.wordHint}
          timeRemaining={timeRemaining}
          hasGuessedCorrectly={myData?.hasGuessedCorrectly ?? false}
        />
      );
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
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('drawGuess.wordWas')}</p>
        <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>
          {host.revealedWord}
        </p>
        {hostless && host.turnScores && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              width: '100%',
              maxWidth: '320px',
            }}
          >
            {host.turnScores.map((ts) => (
              <div
                key={ts.playerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0.7rem',
                  background: 'var(--bg-card)',
                  borderRadius: '0.5rem',
                  borderLeft: `4px solid ${ts.avatarColor}`,
                  fontSize: '0.9rem',
                }}
              >
                <span
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ts.playerName}
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    color: ts.roundScore > 0 ? 'var(--success)' : 'var(--text-secondary)',
                  }}
                >
                  +{ts.roundScore}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {ts.totalScore}
                </span>
              </div>
            ))}
          </div>
        )}
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
              {phase === 'ended' ? t('common.finalPlace') : t('drawGuess.yourPlace')}
            </p>
            <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)' }}>
              #{myEntry.rank}
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
              {myEntry.score.toLocaleString()} {t('common.points')}
            </p>
          </>
        )}
      </div>
    );
  }

  return null;
}
