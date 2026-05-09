import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { useRoomStore } from '../../store/roomStore';
import { DrawingCanvas } from './components/DrawingCanvas';
import { WordHint } from './components/WordHint';
import { GuessList } from './components/GuessList';
import { TurnInfo } from './components/TurnInfo';
import { TurnResults } from './components/TurnResults';
import type {
  DrawGuessHostData,
  DrawGuessLeaderboardEntry,
  Stroke,
} from '@igra/shared';

export default function DrawGuessHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTimeRef = useRef<number>(Infinity);

  useEffect(() => {
    if (!gameState) return;
    const { phase, timeRemaining } = gameState;

    if (phase !== prevPhaseRef.current) {
      if (phase === 'turn-results') play('reveal');
      if (phase === 'ended') play('victory');
      prevPhaseRef.current = phase;
    }

    // Tick sound during drawing countdown (last 10s)
    if (phase === 'drawing') {
      const currSec = Math.ceil(timeRemaining);
      const prevSec = Math.ceil(prevTimeRef.current);
      if (currSec !== prevSec && currSec <= 10 && currSec > 0) {
        play('tick');
      }
    }
    prevTimeRef.current = timeRemaining;
  }, [gameState, play]);

  if (!gameState) return null;

  const { phase, timeRemaining, round, totalRounds, data } = gameState;
  const host = data.host as DrawGuessHostData;
  const leaderboard = data.leaderboard as DrawGuessLeaderboardEntry[] | undefined;

  const totalGuessers = players.filter(
    (p) => p.isConnected && p.id !== host.drawerId
  ).length;

  if (phase === 'choosing-word') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          height: '100%',
        }}
      >
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Runda {round}/{totalRounds}
        </p>
        <p style={{ fontSize: '1.8rem', fontWeight: 700 }}>
          {host.drawerName} bira reč...
        </p>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          {timeRemaining}s
        </p>
      </div>
    );
  }

  if (phase === 'drawing') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.6rem 0.75rem',
          width: '100%',
          height: '100%',
        }}
      >
        <TurnInfo
          drawerName={host.drawerName}
          turnNumber={round}
          totalTurns={totalRounds}
          timeRemaining={timeRemaining}
          correctCount={host.correctGuessers.length}
          totalGuessers={totalGuessers}
        />
        <WordHint hint={host.wordHint} wordLength={host.wordLength} />
        <div
          style={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'stretch',
          }}
        >
          <ResponsiveDrawingArea strokes={host.strokes} />
          <GuessList guesses={host.guesses} />
        </div>
      </div>
    );
  }

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
        }}
      >
        <TurnResults
          word={host.revealedWord ?? ''}
          scores={host.turnScores ?? []}
        />
      </div>
    );
  }

  if ((phase === 'leaderboard' || phase === 'ended') && leaderboard) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '1.5rem',
        }}
      >
        <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
          {phase === 'ended' ? 'Konačni poredak' : 'Rang lista'}
        </p>
        <div style={{ width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {leaderboard.map((entry) => (
            <div
              key={entry.playerId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--accent)', minWidth: '2ch' }}>
                  #{entry.rank}
                </span>
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: entry.avatarColor,
                  }}
                />
                <span style={{ fontWeight: 600 }}>{entry.name}</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                {entry.score.toLocaleString()} poena
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function ResponsiveDrawingArea({ strokes }: { strokes: Stroke[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 600,
    height: 450,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Maintain a 4:3 canvas inside the available space — phones send
    // strokes in normalized 0–1 coords so any aspect we render is fine,
    // but a fixed ratio keeps drawings looking proportional on the TV.
    const update = () => {
      const rect = el.getBoundingClientRect();
      const targetRatio = 4 / 3;
      let w: number;
      let h: number;
      if (rect.width / rect.height > targetRatio) {
        h = rect.height;
        w = h * targetRatio;
      } else {
        w = rect.width;
        h = w / targetRatio;
      }
      setSize({ width: Math.max(1, Math.floor(w)), height: Math.max(1, Math.floor(h)) });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <DrawingCanvas strokes={strokes} width={size.width} height={size.height} />
    </div>
  );
}
