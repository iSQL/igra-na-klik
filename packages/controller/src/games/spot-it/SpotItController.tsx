import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { useHaptics } from '../../hooks/useHaptics';
import { useT } from '../../i18n/useT';
import { SpotItCard } from './components/SpotItCard';

interface MyData {
  personalCard?: number[];
  lockedUntil?: number;
  iWonRound?: boolean;
  iTapped?: boolean;
}

interface RoundResult {
  winnerId: string | null;
  winnerName: string | null;
  matchSymbolIndex: number | null;
  pointsAwarded: Record<string, number>;
}

interface LeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export default function SpotItController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const haptics = useHaptics();
  const t = useT();
  const [lockMsLeft, setLockMsLeft] = useState(0);
  const cardSizeRef = useRef(320);

  // Compute card size from viewport (controllers vary widely).
  useEffect(() => {
    const update = () => {
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      cardSizeRef.current = Math.max(240, Math.min(minDim - 32, 400));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const myData =
    gameState && playerId
      ? ((gameState.playerData[playerId] as MyData) ?? null)
      : null;

  // Tick down lockout for UI countdown overlay
  useEffect(() => {
    const lockedUntil = myData?.lockedUntil ?? 0;
    if (!lockedUntil) {
      setLockMsLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, lockedUntil - Date.now());
      setLockMsLeft(left);
      if (left === 0) return;
      raf = requestAnimationFrame(tick);
    };
    let raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [myData?.lockedUntil]);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data } = gameState;
  const roundNumber = (data.roundNumber as number) ?? 1;
  const personalCard = myData?.personalCard ?? null;
  const iWonRound = myData?.iWonRound ?? false;
  const isLocked = lockMsLeft > 0;

  const handleTap = (symbolIndex: number) => {
    if (isLocked || iWonRound) return;
    haptics.tap();
    socket.emit('game:player-action', {
      action: 'spot-it:tap',
      data: { symbolIndex },
    });
  };

  if (phase === 'card-reveal') {
    return (
      <CenteredScreen>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>
          {t('spotIt.roundShort', { n: roundNumber })}
        </p>
        <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0 }}>{t('spotIt.getReady')}</p>
      </CenteredScreen>
    );
  }

  if (phase === 'racing' && personalCard) {
    if (iWonRound) {
      return (
        <CenteredScreen>
          <p style={{ fontSize: '2.5rem', margin: 0 }}>🏆</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{t('spotIt.wellDone')}</p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            {t('spotIt.waitForOthers')}
          </p>
        </CenteredScreen>
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
          gap: '0.75rem',
          padding: '0.5rem',
          position: 'relative',
        }}
      >
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            margin: 0,
          }}
        >
          {timeRemaining}s • {t('spotIt.findPair')}
        </p>
        <SpotItCard
          symbolIndices={personalCard}
          roundNumber={roundNumber}
          size={cardSizeRef.current}
          onSymbolClick={handleTap}
          dimmed={isLocked}
        />
        {isLocked && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '1.4rem',
              fontWeight: 700,
              color: 'var(--danger)',
              background: 'rgba(0,0,0,0.7)',
              borderRadius: '0.5rem',
              padding: '0.6rem 1.2rem',
              pointerEvents: 'none',
            }}
          >
            {(lockMsLeft / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    );
  }

  if (phase === 'round-results') {
    const roundResult = data.roundResult as RoundResult | undefined;
    const myPoints = roundResult?.pointsAwarded[playerId] ?? 0;
    const wonThisRound = roundResult?.winnerId === playerId;
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '0.75rem',
          padding: '0.5rem',
        }}
      >
        {personalCard && (
          <SpotItCard
            symbolIndices={personalCard}
            roundNumber={roundNumber}
            size={cardSizeRef.current * 0.85}
            highlightSymbolIndex={roundResult?.matchSymbolIndex ?? null}
          />
        )}
        <p
          style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            color: wonThisRound ? 'var(--success)' : 'var(--text-secondary)',
            margin: 0,
          }}
        >
          {wonThisRound
            ? t('spotIt.pointsWon', { n: myPoints })
            : t('spotIt.zeroPoints')}
        </p>
        {!wonThisRound && roundResult?.winnerName && (
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            {t('spotIt.winner', { name: roundResult.winnerName })}
          </p>
        )}
      </div>
    );
  }

  if (phase === 'final-leaderboard' || phase === 'ended') {
    const leaderboard = (data.leaderboard as LeaderboardEntry[] | undefined) ?? [];
    const myEntry = leaderboard.find((e) => e.playerId === playerId);
    return (
      <CenteredScreen>
        {myEntry && (
          <>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>
              {t('common.finalPlace')}
            </p>
            <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)', margin: 0 }}>
              #{myEntry.rank}
            </p>
            <p style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
              {myEntry.score.toLocaleString()} {t('common.points')}
            </p>
          </>
        )}
      </CenteredScreen>
    );
  }

  return null;
}

function CenteredScreen({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1rem',
        padding: '1.5rem',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}
