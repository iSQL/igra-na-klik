import type { ReactNode } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { useT } from '../../i18n/useT';
import { GameFrame } from '../../components/kit/GameFrame';
import { WordPicker } from './components/WordPicker';
import { DrawingPad } from './components/DrawingPad';
import { GuessingInput } from './components/GuessingInput';
import { HostlessGuessing } from './components/HostlessGuessing';
import type {
  DrawGuessControllerData,
  DrawGuessHostData,
  DrawGuessLeaderboardEntry,
} from '@igra/shared';

const center: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: '1rem',
  textAlign: 'center',
  padding: '1rem 0',
};

export default function DrawGuessController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);
  const roster = usePlayerStore((s) => s.room?.players ?? []);
  const t = useT();

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData, round, totalRounds } = gameState;
  const myData = playerData[playerId] as unknown as DrawGuessControllerData | undefined;
  const host = data.host as DrawGuessHostData;
  const isDrawer = myData?.isDrawer ?? false;
  const timed = phase === 'choosing-word' || phase === 'drawing';

  let body: ReactNode = null;

  if (phase === 'choosing-word') {
    body =
      isDrawer && myData?.wordChoices ? (
        <WordPicker
          words={myData.wordChoices}
          onPick={(index) => {
            socket.emit('game:player-action', {
              action: 'draw:choose-word',
              data: { wordIndex: index },
            });
          }}
        />
      ) : (
        <div style={center}>
          <span style={{ fontSize: '2.6rem' }}>✏️</span>
          <p className="display" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            {t('drawGuess.choosingWord', { name: host.drawerName })}
          </p>
        </div>
      );
  } else if (phase === 'drawing') {
    if (isDrawer) {
      // Everyone but the drawer guesses; the pill says how many already did.
      const guessers = roster.filter((p) => p.id !== playerId).length;
      body = (
        <DrawingPad
          operations={host.operations}
          header={
            <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('drawGuess.yourWord')}
              </span>
              <span
                className="display"
                style={{
                  fontWeight: 800,
                  fontSize: '1.85rem',
                  lineHeight: 1.05,
                  color: 'var(--amber)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {myData?.word ?? '…'}
              </span>
            </div>
          }
          pill={
            <>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: host.correctGuessers.length ? 'var(--lime)' : 'var(--dim)',
                }}
              />
              {t('drawGuess.guessedCount', { n: host.correctGuessers.length, total: guessers })}
            </>
          }
        />
      );
    } else if (hostless) {
      // No TV showing the drawing — a read-only copy of the canvas with the
      // live feed of everyone's guesses beside it, above the guess input.
      body = (
        <HostlessGuessing
          operations={host.operations}
          guesses={host.guesses}
          hint={host.wordHint}
          hasGuessedCorrectly={myData?.hasGuessedCorrectly ?? false}
        />
      );
    } else {
      body = (
        <GuessingInput hasGuessedCorrectly={myData?.hasGuessedCorrectly ?? false} hint={host.wordHint} />
      );
    }
  } else if (phase === 'turn-results') {
    body = (
      <div style={center}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
          {t('drawGuess.wordWas')}
        </p>
        <p
          className="display"
          style={{
            fontSize: '2.4rem',
            fontWeight: 800,
            color: 'var(--success-ink)',
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          {host.revealedWord}
        </p>
        {hostless && host.turnScores && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            {host.turnScores.map((ts) => (
              <div
                key={ts.playerId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 48,
                  padding: '0 14px',
                  background: ts.playerId === playerId ? 'rgba(194,155,71,.16)' : 'var(--bg-secondary)',
                  borderRadius: 14,
                  fontSize: '0.92rem',
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: ts.avatarColor }} />
                <span
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ts.playerName}
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    color: ts.roundScore > 0 ? 'var(--success-ink)' : 'var(--text-secondary)',
                  }}
                >
                  +{ts.roundScore}
                </span>
                <span style={{ color: 'var(--text-secondary)', minWidth: '3ch', textAlign: 'right' }}>
                  {ts.totalScore}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } else if ((phase === 'leaderboard' || phase === 'ended') && data.leaderboard) {
    const leaderboard = data.leaderboard as DrawGuessLeaderboardEntry[];
    const myEntry = leaderboard.find((e) => e.playerId === playerId);
    body = myEntry ? (
      <div style={center}>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>
          {phase === 'ended' ? t('common.finalPlace') : t('drawGuess.yourPlace')}
        </p>
        <p className="display" style={{ fontSize: '3.4rem', fontWeight: 800, color: 'var(--amber)', margin: 0 }}>
          #{myEntry.rank}
        </p>
        <p style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>
          {myEntry.score.toLocaleString()} {t('common.points')}
        </p>
      </div>
    ) : null;
  }

  return (
    <GameFrame
      gameId="draw-guess"
      subtitle={phase === 'ended' ? t('reconnect.gameEnded') : t('drawGuess.turn', { n: round, total: totalRounds })}
      timeRemaining={timed ? timeRemaining : undefined}
      timeTotal={phase === 'drawing' ? host.timeLimit : undefined}
      roundKey={phase === 'drawing' ? round : undefined}
    >
      {body}
    </GameFrame>
  );
}
