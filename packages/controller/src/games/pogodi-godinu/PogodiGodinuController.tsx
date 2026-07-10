import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import {
  formatPogodiBrojValue,
  type PogodiBrojValueType,
  type PogodiGodinuControllerData,
  type PogodiGodinuHostData,
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
  const unit = host.event?.unit;
  const valueType = host.event?.valueType;
  const fmt = (v: number) => formatPogodiBrojValue(v, unit, valueType);

  if (phase === 'intro') {
    return (
      <div style={wrap}>
        <p style={{ fontSize: '2.2rem' }}>🔢</p>
        <p style={{ fontSize: '1.4rem', fontWeight: 800 }}>Pogodi broj</p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Pomeri klizač što bliže tačnoj vrednosti — i požuri!
        </p>
      </div>
    );
  }

  if (phase === 'guessing') {
    if (my?.hasLocked) {
      return (
        <div style={wrap}>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
            Zaključao si odgovor
          </p>
          <p style={{ fontSize: '3rem', fontWeight: 800 }}>
            {my.ownGuess != null ? fmt(my.ownGuess) : '—'}
          </p>
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
        imageUrl={host.event?.imageUrl}
        min={host.event?.min ?? 0}
        max={host.event?.max ?? 100}
        step={host.event?.step}
        unit={unit}
        valueType={valueType}
        timeRemaining={timeRemaining}
      />
    );
  }

  if (phase === 'reveal') {
    const dist = my?.ownDistance;
    const pts = my?.ownPoints ?? 0;
    const results = host.results ?? [];
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          padding: '1rem',
          gap: '0.75rem',
          overflowY: 'auto',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            Tačan odgovor
          </p>
          <p
            style={{
              fontSize: '2.6rem',
              fontWeight: 800,
              color: 'var(--accent)',
              margin: '0.1rem 0',
            }}
          >
            {host.trueValue != null ? fmt(host.trueValue) : '—'}
          </p>
          {dist === null || dist === undefined ? (
            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
              Nisi zaključao odgovor
            </p>
          ) : (
            <p style={{ fontSize: '1rem', margin: 0 }}>
              {my?.wasExact
                ? 'Pun pogodak! 🎯'
                : `Promašio si za ${fmt(dist)}`}
              {' · '}
              <strong style={{ color: pts > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>
                +{pts}
              </strong>
            </p>
          )}
        </div>

        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {results.map((r) => {
              const isMe = r.playerId === playerId;
              return (
                <div
                  key={r.playerId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.45rem 0.6rem',
                    background: isMe
                      ? 'rgba(194,155,71,.16)'
                      : 'var(--bg-secondary)',
                    border: `1px solid ${isMe ? 'var(--accent)' : 'transparent'}`,
                    borderRadius: '0.5rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: r.avatarColor,
                      flex: 'none',
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      textAlign: 'left',
                      fontWeight: isMe ? 800 : 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {r.name}
                  </span>
                  <span
                    style={{
                      color: 'var(--text-secondary)',
                      minWidth: '4ch',
                      textAlign: 'right',
                    }}
                  >
                    {r.guess != null ? fmt(r.guess) : '—'}
                  </span>
                  <span
                    style={{
                      color: 'var(--text-secondary)',
                      minWidth: '4ch',
                      textAlign: 'right',
                      fontSize: '0.78rem',
                    }}
                  >
                    {r.distance === null ? '' : `±${fmt(r.distance)}`}
                  </span>
                  <span
                    style={{
                      fontWeight: 800,
                      minWidth: '3ch',
                      textAlign: 'right',
                      color: r.points > 0 ? 'var(--success)' : 'var(--text-secondary)',
                    }}
                  >
                    +{r.points}
                  </span>
                </div>
              );
            })}
          </div>
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
  imageUrl,
  min,
  max,
  step,
  unit,
  valueType,
  timeRemaining,
}: {
  prompt: string;
  emoji?: string;
  imageUrl?: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  valueType?: PogodiBrojValueType;
  timeRemaining: number;
}) {
  const stepSize = step && step > 0 ? step : 1;
  const snap = (v: number) => {
    const clamped = Math.max(min, Math.min(max, v));
    const snapped = min + Math.round((clamped - min) / stepSize) * stepSize;
    return Math.max(min, Math.min(max, snapped));
  };
  const [value, setValue] = useState(() => snap((min + max) / 2));
  const [sent, setSent] = useState(false);
  const pct =
    max > min ? Math.round(((value - min) / (max - min)) * 100) : 50;

  const lock = () => {
    if (sent) return;
    setSent(true);
    socket.emit('game:player-action', {
      action: 'broj:guess',
      data: { value },
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
        gap: '0.85rem',
        justifyContent: 'center',
      }}
    >
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
        Koliko? · {timeRemaining}s
      </p>
      <p style={{ fontSize: '1.25rem', fontWeight: 800, textAlign: 'center', margin: 0, lineHeight: 1.3 }}>
        {emoji ? `${emoji} ` : ''}
        {prompt}
      </p>

      {imageUrl && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <img
            src={imageUrl}
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: '32vh',
              objectFit: 'contain',
              borderRadius: '0.6rem',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <button
          onClick={() => setValue((v) => snap(v - stepSize))}
          style={stepBtn}
          aria-label="Manje"
        >
          −
        </button>
        <span
          style={{
            fontSize: '2.4rem',
            fontWeight: 800,
            minWidth: '6.5rem',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatPogodiBrojValue(value, unit, valueType)}
        </span>
        <button
          onClick={() => setValue((v) => snap(v + stepSize))}
          style={stepBtn}
          aria-label="Više"
        >
          +
        </button>
      </div>

      <input
        type="range"
        className="range-fat"
        min={min}
        max={max}
        step={stepSize}
        value={value}
        onChange={(e) => setValue(snap(parseFloat(e.target.value)))}
        style={{ ['--pct' as string]: `${pct}%` } as React.CSSProperties}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <span>{formatPogodiBrojValue(min, unit, valueType)}</span>
        <span>{formatPogodiBrojValue(max, unit, valueType)}</span>
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
        {sent ? 'Zaključano ✓' : 'Zaključaj odgovor'}
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
