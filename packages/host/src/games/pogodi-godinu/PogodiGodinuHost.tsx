import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';
import {
  formatPogodiBrojValue,
  type PogodiBrojValueType,
  type PogodiGodinuGuessResult,
  type PogodiGodinuHostData,
} from '@igra/shared';

export default function PogodiGodinuHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTimeRef = useRef<number>(Infinity);

  useEffect(() => {
    if (!gameState) return;
    const { phase, timeRemaining } = gameState;
    if (phase !== prevPhaseRef.current) {
      if (phase === 'reveal') play('reveal');
      if (phase === 'ended') play('victory');
      prevPhaseRef.current = phase;
    }
    if (phase === 'guessing') {
      const currSec = Math.ceil(timeRemaining);
      const prevSec = Math.ceil(prevTimeRef.current);
      if (currSec !== prevSec && currSec <= 5 && currSec > 0) play('tick');
    }
    prevTimeRef.current = timeRemaining;
  }, [gameState, play]);

  if (!gameState) return null;

  const { phase, timeRemaining, data } = gameState;
  const host = data.host as PogodiGodinuHostData;
  const unit = host.event?.unit;
  const valueType = host.event?.valueType;
  const fmt = (v: number) => formatPogodiBrojValue(v, unit, valueType);
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';

  if (phase === 'intro') {
    return (
      <Center>
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '3.4rem', fontWeight: 800 }}
        >
          🔢 Pogodi broj
        </motion.p>
        <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
          Koliko je to? Bliži i brži pogodak nosi više poena.
        </p>
      </Center>
    );
  }

  if (phase === 'guessing') {
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds}
        </p>
        <p style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>
          Koliko?
        </p>
        <motion.p
          key={host.event?.text}
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            fontSize: '3rem',
            fontWeight: 800,
            textAlign: 'center',
            maxWidth: '1000px',
            lineHeight: 1.2,
          }}
        >
          {host.event?.emoji ? `${host.event.emoji} ` : ''}
          {host.event?.text}
        </motion.p>
        {host.event?.imageUrl && (
          <motion.img
            key={host.event.imageUrl}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            src={host.event.imageUrl}
            alt=""
            style={{
              maxWidth: 'min(90%, 720px)',
              maxHeight: '46vh',
              objectFit: 'contain',
              borderRadius: '1rem',
            }}
          />
        )}
        <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
          Pomeri klizač na telefonu · {host.lockedCount}/{host.totalGuessers} · {timeRemaining}s
        </p>
      </Center>
    );
  }

  if (phase === 'reveal') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          padding: '1.5rem',
          width: '100%',
          height: '100%',
          overflowY: 'auto',
        }}
      >
        <p style={{ fontSize: '1.4rem', fontWeight: 700, textAlign: 'center', maxWidth: '1000px' }}>
          {host.event?.emoji ? `${host.event.emoji} ` : ''}
          {host.event?.text}
        </p>
        {host.event?.imageUrl && (
          <img
            src={host.event.imageUrl}
            alt=""
            style={{
              maxWidth: 'min(80%, 520px)',
              maxHeight: '30vh',
              objectFit: 'contain',
              borderRadius: '0.8rem',
            }}
          />
        )}
        <motion.p
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '3.2rem', fontWeight: 800, color: 'var(--accent)' }}
        >
          {host.trueValue != null ? fmt(host.trueValue) : '—'}
        </motion.p>

        <Timeline
          min={host.event?.min ?? 0}
          max={host.event?.max ?? 100}
          trueValue={host.trueValue ?? host.event?.min ?? 0}
          results={host.results ?? []}
          unit={unit}
          valueType={valueType}
        />

        <div style={{ width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {host.results?.map((r) => (
            <div
              key={r.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.4rem 0.7rem',
                background: 'var(--bg-secondary)',
                borderRadius: '0.5rem',
                borderLeft: `5px solid ${r.avatarColor}`,
              }}
            >
              <span style={{ flex: 1, fontWeight: 600 }}>
                {emojiFor(r.playerId)} {r.name}
              </span>
              <span style={{ color: 'var(--text-secondary)', minWidth: '4.5rem', textAlign: 'right' }}>
                {r.guess != null ? fmt(r.guess) : '—'}
              </span>
              <span style={{ color: 'var(--text-secondary)', minWidth: '4.5rem', textAlign: 'right', fontSize: '0.85rem' }}>
                {r.distance === null ? '' : `±${fmt(r.distance)}`}
              </span>
              <span style={{ fontWeight: 800, minWidth: '3.5rem', textAlign: 'right', color: r.points > 0 ? '#7be37b' : 'var(--text-secondary)' }}>
                +{r.points}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if ((phase === 'final-leaderboard' || phase === 'ended') && host.leaderboard) {
    return (
      <Center>
        <p style={{ fontSize: '1.6rem', fontWeight: 800 }}>
          {phase === 'ended' ? 'Konačni poredak' : 'Trenutni poredak'}
        </p>
        <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {host.leaderboard.map((entry) => (
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
                    width: '1.75rem',
                    height: '1.75rem',
                    borderRadius: '50%',
                    background: entry.avatarColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                  }}
                >
                  {emojiFor(entry.playerId)}
                </div>
                <span style={{ fontWeight: 600 }}>{entry.name}</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                {entry.score.toLocaleString()} poena
              </span>
            </div>
          ))}
        </div>
      </Center>
    );
  }

  return null;
}

function Timeline({
  min,
  max,
  trueValue,
  results,
  unit,
  valueType,
}: {
  min: number;
  max: number;
  trueValue: number;
  results: PogodiGodinuGuessResult[];
  unit?: string;
  valueType?: PogodiBrojValueType;
}) {
  const span = Math.max(1, max - min);
  const pct = (v: number) => ((v - min) / span) * 100;
  return (
    <div style={{ width: '100%', maxWidth: '900px', padding: '2.2rem 1rem 1.6rem' }}>
      <div style={{ position: 'relative', height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
        {/* Guess markers */}
        {results
          .filter((r) => r.guess !== null)
          .map((r) => (
            <div
              key={r.playerId}
              title={`${r.name}: ${r.guess}`}
              style={{
                position: 'absolute',
                left: `${pct(r.guess as number)}%`,
                top: '50%',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: r.avatarColor,
                border: '2px solid var(--bg-primary, #14141f)',
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        {/* True-value marker */}
        <div
          style={{
            position: 'absolute',
            left: `${pct(trueValue)}%`,
            top: '-1.9rem',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent)' }}>
            {formatPogodiBrojValue(trueValue, unit, valueType)}
          </span>
          <div style={{ width: '3px', height: '2.6rem', background: 'var(--accent)', borderRadius: '2px' }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <span>{formatPogodiBrojValue(min, unit, valueType)}</span>
        <span>{formatPogodiBrojValue(max, unit, valueType)}</span>
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
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
      }}
    >
      {children}
    </div>
  );
}
