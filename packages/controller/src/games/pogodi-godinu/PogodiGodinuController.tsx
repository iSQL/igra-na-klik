import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import type {
  PogodiGodinuControllerData,
  PogodiGodinuHostData,
} from '@igra/shared';

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

export default function PogodiGodinuController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => s.room?.hostless ?? false);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, round, data, playerData } = gameState;
  const host = data.host as PogodiGodinuHostData;
  const my = playerData[playerId] as unknown as
    | PogodiGodinuControllerData
    | undefined;

  if (phase === 'intro') {
    return (
      <div style={wrap}>
        <p style={{ fontSize: '2.2rem' }}>📅</p>
        <p style={{ fontSize: '1.4rem', fontWeight: 800 }}>Pogodi godinu</p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Pomeri klizač što bliže tačnoj godini!
        </p>
      </div>
    );
  }

  if (phase === 'guessing') {
    if (my?.hasLocked) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
            Zaključao si godinu
          </p>
          <p style={{ fontSize: '3rem', fontWeight: 800 }}>{my.ownGuess}</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {host.lockedCount}/{host.totalGuessers} zaključalo
          </p>
        </div>
      );
    }
    return (
      <GuessingView
        key={round}
        prompt={host.event?.text ?? ''}
        emoji={host.event?.emoji}
        yearMin={host.yearMin}
        yearMax={host.yearMax}
        timeRemaining={timeRemaining}
      />
    );
  }

  if (phase === 'reveal') {
    const dist = my?.ownDistance;
    const pts = my?.ownPoints ?? 0;
    return (
      <div style={wrap}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Tačna godina
        </p>
        <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)' }}>
          {host.trueYear}
        </p>
        {dist === null || dist === undefined ? (
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
            Nisi zaključao godinu
          </p>
        ) : (
          <>
            <p style={{ fontSize: '1.05rem' }}>
              {my?.wasExact
                ? 'Pun pogodak! 🎯'
                : `Promašio si za ${dist} ${dist === 1 ? 'godinu' : 'godina'}`}
            </p>
            <p
              style={{
                fontSize: '1.4rem',
                fontWeight: 800,
                color: pts > 0 ? 'var(--success)' : 'var(--text-secondary)',
              }}
            >
              +{pts} poena
            </p>
          </>
        )}
      </div>
    );
  }

  if (phase === 'final-leaderboard' || phase === 'ended') {
    const entry = host.leaderboard?.find((e) => e.playerId === playerId);
    if (hostless && host.leaderboard) {
      return (
        <HostlessLeaderboard
          title="Konačni poredak"
          entries={host.leaderboard}
          myPlayerId={playerId}
        />
      );
    }
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          {phase === 'ended' ? 'Konačni plasman' : 'Poredak'}
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

function GuessingView({
  prompt,
  emoji,
  yearMin,
  yearMax,
  timeRemaining,
}: {
  prompt: string;
  emoji?: string;
  yearMin: number;
  yearMax: number;
  timeRemaining: number;
}) {
  const [year, setYear] = useState(Math.round((yearMin + yearMax) / 2));
  const [sent, setSent] = useState(false);

  const clamp = (y: number) => Math.max(yearMin, Math.min(yearMax, y));

  const lock = () => {
    if (sent) return;
    setSent(true);
    socket.emit('game:player-action', {
      action: 'godina:guess',
      data: { year },
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '1rem',
        gap: '1rem',
        justifyContent: 'center',
      }}
    >
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
        Kada se ovo desilo? · {timeRemaining}s
      </p>
      <p style={{ fontSize: '1.35rem', fontWeight: 800, textAlign: 'center', margin: 0, lineHeight: 1.3 }}>
        {emoji ? `${emoji} ` : ''}
        {prompt}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <button
          onClick={() => setYear((y) => clamp(y - 1))}
          style={stepBtn}
          aria-label="Godina manje"
        >
          −
        </button>
        <span
          style={{
            fontSize: '3rem',
            fontWeight: 800,
            minWidth: '5.5rem',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {year}
        </span>
        <button
          onClick={() => setYear((y) => clamp(y + 1))}
          style={stepBtn}
          aria-label="Godina više"
        >
          +
        </button>
      </div>

      <input
        type="range"
        min={yearMin}
        max={yearMax}
        step={1}
        value={year}
        onChange={(e) => setYear(clamp(parseInt(e.target.value, 10)))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <span>{yearMin}</span>
        <span>{yearMax}</span>
      </div>

      <button
        onClick={lock}
        disabled={sent}
        style={{
          padding: '1rem',
          fontSize: '1.2rem',
          fontWeight: 800,
          borderRadius: '12px',
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          opacity: sent ? 0.5 : 1,
        }}
      >
        {sent ? 'Zaključano ✓' : 'Zaključaj godinu'}
      </button>
    </div>
  );
}

const stepBtn: React.CSSProperties = {
  width: '52px',
  height: '52px',
  borderRadius: '50%',
  border: '2px solid var(--text-secondary)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '1.8rem',
  fontWeight: 800,
  lineHeight: 1,
};
