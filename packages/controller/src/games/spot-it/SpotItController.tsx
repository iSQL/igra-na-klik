import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { useHaptics } from '../../hooks/useHaptics';
import { useT } from '../../i18n/useT';
import { SpotItCard } from './components/SpotItCard';

interface MyData {
  personalCard?: number[];
  /** Remaining lockout in ms after a wrong tap (relative, clock-skew safe). */
  lockMs?: number;
  iWonRound?: boolean;
  iTapped?: boolean;
}

interface RoundResult {
  winnerId: string | null;
  winnerName: string | null;
  matchSymbolIndex: number | null;
  pointsAwarded: Record<string, number>;
}

interface Standing {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
  roundPoints: number;
  totalScore: number;
  rank: number;
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
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);
  const haptics = useHaptics();
  const t = useT();
  const [lockMsLeft, setLockMsLeft] = useState(0);
  const cardSizeRef = useRef(320);
  // Smaller size for hostless mode, where the phone stacks the center card
  // above the personal card (no TV to show the center card).
  const dualCardSizeRef = useRef(200);

  // Compute card size from viewport (controllers vary widely).
  useEffect(() => {
    const update = () => {
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      cardSizeRef.current = Math.max(240, Math.min(minDim - 32, 400));
      // Two stacked cards must share the height (minus labels/timer chrome).
      dualCardSizeRef.current = Math.max(
        150,
        Math.min(window.innerWidth - 40, (window.innerHeight - 150) / 2)
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const myData =
    gameState && playerId
      ? ((gameState.playerData[playerId] as MyData) ?? null)
      : null;

  // Tick down lockout for UI countdown overlay. The server sends the
  // remaining ms (relative); we pin it to a local deadline so the countdown
  // runs on this device's clock — immune to client/server clock skew.
  useEffect(() => {
    const lockMs = myData?.lockMs ?? 0;
    if (lockMs <= 0) {
      setLockMsLeft(0);
      return;
    }
    const deadline = Date.now() + lockMs;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setLockMsLeft(left);
      if (left <= 0) return;
      raf = requestAnimationFrame(tick);
    };
    let raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [myData?.lockMs]);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data } = gameState;
  const roundNumber = (data.roundNumber as number) ?? 1;
  const centerCard = (data.centerCard as number[] | undefined) ?? null;
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
        <p className="display" style={{ fontSize: '1.9rem', fontWeight: 700, margin: 0, animation: 'igra-pop .4s' }}>
          {t('spotIt.getReady')}
        </p>
      </CenteredScreen>
    );
  }

  if (phase === 'racing' && personalCard) {
    if (iWonRound) {
      return (
        <CenteredScreen>
          <p style={{ fontSize: '2.5rem', margin: 0, animation: 'igra-pop .5s' }}>🏆</p>
          <p className="display" style={{ fontSize: '1.7rem', fontWeight: 700, color: 'var(--success)', margin: 0 }}>
            {t('spotIt.wellDone')}
          </p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
            {t('spotIt.waitForOthers')}
          </p>
        </CenteredScreen>
      );
    }
    // Hostless: no TV, so the phone shows the center card (read-only) above
    // the player's own card (tappable). The player finds the shared symbol
    // and taps it on their own card, exactly as on the big screen.
    if (hostless && centerCard) {
      const dualSize = dualCardSizeRef.current;
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '0.4rem',
            padding: '0.4rem',
            position: 'relative',
          }}
        >
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
            {timeRemaining}s • {t('spotIt.findPair')}
          </p>
          <SpotItCard
            symbolIndices={centerCard}
            roundNumber={roundNumber}
            size={dualSize}
          />
          <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0, fontWeight: 700 }}>
            ↓ {t('spotIt.yourCard')} ↓
          </p>
          <SpotItCard
            symbolIndices={personalCard}
            roundNumber={roundNumber}
            size={dualSize}
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
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.2rem',
                fontWeight: 800,
                color: '#fff',
                background: 'rgba(200,40,55,0.92)',
                borderRadius: '0.9rem',
                padding: '0.9rem 1.6rem',
                boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
                animation: 'igra-pop .2s',
              }}
            >
              <span style={{ fontSize: '2rem', lineHeight: 1 }}>✗</span>
              <span style={{ fontSize: '2.4rem', lineHeight: 1 }}>
                {(lockMsLeft / 1000).toFixed(1)}s
              </span>
            </div>
          )}
        </div>
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
    const standings = (data.standings as Standing[] | undefined) ?? [];
    const myPoints = roundResult?.pointsAwarded[playerId] ?? 0;
    const wonThisRound = roundResult?.winnerId === playerId;
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          height: '100%',
          gap: '0.6rem',
          padding: '0.6rem',
          overflowY: 'auto',
        }}
      >
        {personalCard && (
          <SpotItCard
            symbolIndices={personalCard}
            roundNumber={roundNumber}
            size={cardSizeRef.current * 0.55}
            highlightSymbolIndex={roundResult?.matchSymbolIndex ?? null}
          />
        )}
        <p
          style={{
            fontSize: '1.3rem',
            fontWeight: 700,
            color: wonThisRound ? 'var(--success)' : 'var(--text-secondary)',
            margin: 0,
            flexShrink: 0,
          }}
        >
          {wonThisRound
            ? t('spotIt.pointsWon', { n: myPoints })
            : t('spotIt.zeroPoints')}
        </p>

        {standings.length > 0 && (
          <div style={{ width: '100%', maxWidth: '420px', flexShrink: 0 }}>
            <p
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary)',
                margin: '0 0 0.35rem',
                textAlign: 'center',
              }}
            >
              {t('spotIt.standings')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {standings.map((s) => {
                const isMe = s.playerId === playerId;
                return (
                  <div
                    key={s.playerId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '10px',
                      background: isMe ? 'var(--bg-card)' : 'var(--bg-secondary)',
                      border: isMe ? '1px solid var(--accent)' : '1px solid var(--line2)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ fontWeight: 800, color: 'var(--text-secondary)', minWidth: '1.4rem' }}>
                      {s.rank}
                    </span>
                    <span
                      className="avatar-tile"
                      style={{ width: '22px', height: '22px', backgroundColor: s.avatarColor, fontSize: '0.8rem' }}
                    >
                      {s.avatarEmoji}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontWeight: isMe ? 800 : 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.name}
                    </span>
                    {s.roundPoints > 0 && (
                      <span style={{ fontWeight: 700, color: 'var(--success)' }}>
                        +{s.roundPoints}
                      </span>
                    )}
                    <span style={{ fontWeight: 800, minWidth: '3.5ch', textAlign: 'right' }}>
                      {s.totalScore.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
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
            <p className="display text-grad" style={{ fontSize: '4rem', fontWeight: 700, margin: 0, animation: 'igra-pop .5s' }}>
              #{myEntry.rank}
            </p>
            <p className="display" style={{ fontSize: '1.6rem', fontWeight: 600, margin: 0 }}>
              {myEntry.score.toLocaleString()}{' '}
              <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
                {t('common.points')}
              </span>
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
