import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { useRoomStore } from '../../store/roomStore';
import { useSound } from '../../hooks/useSound';
import { DrawingCanvas } from '../draw-guess/components/DrawingCanvas';
import type { DrawOp, FakeArtistHostData } from '@igra/shared';

export default function FakeArtistHost() {
  const gameState = useGameStore((s) => s.gameState);
  const players = useRoomStore((s) => s.players);
  const { play } = useSound();
  const prevPhaseRef = useRef<string | null>(null);
  const prevTimeRef = useRef<number>(Infinity);

  useEffect(() => {
    if (!gameState) return;
    const { phase, timeRemaining } = gameState;
    if (phase !== prevPhaseRef.current) {
      if (phase === 'results') play('reveal');
      if (phase === 'ended') play('victory');
      if (phase === 'voting') play('reveal');
      prevPhaseRef.current = phase;
    }
    if (phase === 'drawing' || phase === 'voting') {
      const currSec = Math.ceil(timeRemaining);
      const prevSec = Math.ceil(prevTimeRef.current);
      if (currSec !== prevSec && currSec <= 5 && currSec > 0) play('tick');
    }
    prevTimeRef.current = timeRemaining;
  }, [gameState, play]);

  if (!gameState) return null;

  const { phase, timeRemaining, data } = gameState;
  const host = data.host as FakeArtistHostData;
  const emojiFor = (id: string) =>
    players.find((p) => p.id === id)?.avatarEmoji ?? '👤';

  // --- reveal-role ------------------------------------------------------
  if (phase === 'reveal-role') {
    return (
      <Center>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds}
        </p>
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '2.6rem', fontWeight: 800, textAlign: 'center' }}
        >
          Pogledajte svoje telefone!
        </motion.p>
        <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
          Kategorija: <strong style={{ color: 'var(--accent)' }}>{host.category}</strong>
        </p>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Jedan igrač je lažni umetnik — ne zna reč. Pronađite ga!
        </p>
      </Center>
    );
  }

  // --- drawing ----------------------------------------------------------
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            maxWidth: '900px',
            fontSize: '1.1rem',
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>
            Runda {host.round}/{host.totalRounds} · Kategorija:{' '}
            <strong style={{ color: 'var(--accent)' }}>{host.category}</strong>
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Potez {host.turnNumber}/{host.totalTurns}
          </span>
          <span
            style={{
              fontWeight: 800,
              fontSize: timeRemaining <= 5 ? '1.6rem' : '1.2rem',
              color: timeRemaining <= 5 ? '#e74c3c' : 'var(--text-primary)',
            }}
          >
            {timeRemaining}s
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '1.4rem',
            fontWeight: 800,
          }}
        >
          <span
            style={{
              width: '1.2rem',
              height: '1.2rem',
              borderRadius: '50%',
              background:
                host.turnOrder.find((t) => t.playerId === host.currentDrawerId)
                  ?.avatarColor ?? '#888',
              display: 'inline-block',
            }}
          />
          Crta: {emojiFor(host.currentDrawerId ?? '')} {host.currentDrawerName}
        </div>

        <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <ResponsiveDrawingArea operations={host.operations} />
        </div>

        <TurnStrip host={host} emojiFor={emojiFor} />
      </div>
    );
  }

  // --- voting -----------------------------------------------------------
  if (phase === 'voting') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem',
          width: '100%',
          height: '100%',
        }}
      >
        <p style={{ fontSize: '2rem', fontWeight: 800 }}>Ko je lažni umetnik?</p>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
          Glasajte na telefonima · {host.votedCount}/{host.totalVoters} · {timeRemaining}s
        </p>
        <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <ResponsiveDrawingArea operations={host.operations} />
        </div>
      </div>
    );
  }

  // --- fake-guess -------------------------------------------------------
  if (phase === 'fake-guess') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem',
          width: '100%',
          height: '100%',
        }}
      >
        <p style={{ fontSize: '2rem', fontWeight: 800 }}>Lažnjak je uhvaćen! 🎭</p>
        <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
          Pokušava da pogodi reč da spase poene... {timeRemaining}s
        </p>
        <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <ResponsiveDrawingArea operations={host.operations} />
        </div>
      </div>
    );
  }

  // --- results ----------------------------------------------------------
  if (phase === 'results') {
    const maxVotes = Math.max(1, ...(host.voteTally ?? []).map((v) => v.votes));
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
        <motion.p
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}
        >
          Lažni umetnik je bio
        </motion.p>
        <p style={{ fontSize: '2.4rem', fontWeight: 800 }}>
          🎭 {emojiFor(host.fakeArtistId ?? '')} {host.fakeArtistName}
        </p>
        <p style={{ fontSize: '1.4rem' }}>
          Reč je bila{' '}
          <strong style={{ color: 'var(--accent)' }}>{host.word}</strong>
        </p>
        <p
          style={{
            fontSize: '1.5rem',
            fontWeight: 800,
            color: host.fakeCaught ? '#7be37b' : '#e74c3c',
          }}
        >
          {host.fakeCaught
            ? host.fakeGuessCorrect
              ? `Uhvaćen — ali je pogodio reč (${host.fakeGuess})!`
              : 'Uhvaćen — umetnici pobeđuju!'
            : 'Pobegao je — lažnjak pobeđuje!'}
        </p>

        <div style={{ width: '100%', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {host.voteTally?.map((v) => (
            <div key={v.suspectId} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ width: '9rem', textAlign: 'right', fontWeight: v.isFake ? 800 : 600 }}>
                {v.isFake ? '🎭 ' : ''}
                {emojiFor(v.suspectId)} {v.name}
              </span>
              <div style={{ flex: 1, height: '1.4rem', background: 'var(--bg-secondary)', borderRadius: '0.4rem', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(v.votes / maxVotes) * 100}%`,
                    height: '100%',
                    background: v.avatarColor,
                    transition: 'width 0.4s',
                  }}
                />
              </div>
              <span style={{ width: '2rem', fontWeight: 700 }}>{v.votes}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- ended ------------------------------------------------------------
  if (phase === 'ended' && host.leaderboard) {
    return (
      <Center>
        <p style={{ fontSize: '1.6rem', fontWeight: 800 }}>Konačni poredak</p>
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

function TurnStrip({
  host,
  emojiFor,
}: {
  host: FakeArtistHostData;
  emojiFor: (id: string) => string;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
      {host.turnOrder.map((t) => {
        const active = t.playerId === host.currentDrawerId;
        return (
          <span
            key={t.playerId}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              padding: '0.25rem 0.6rem',
              borderRadius: '0.5rem',
              fontSize: '0.85rem',
              background: active ? 'var(--bg-card)' : 'transparent',
              border: `2px solid ${active ? t.avatarColor : 'transparent'}`,
              opacity: active ? 1 : 0.55,
              fontWeight: active ? 800 : 600,
            }}
          >
            <span
              style={{
                width: '0.8rem',
                height: '0.8rem',
                borderRadius: '50%',
                background: t.avatarColor,
                display: 'inline-block',
              }}
            />
            {emojiFor(t.playerId)} {t.name}
          </span>
        );
      })}
    </div>
  );
}

function ResponsiveDrawingArea({ operations }: { operations: DrawOp[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 450 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
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
        width: '100%',
      }}
    >
      <DrawingCanvas operations={operations} width={size.width} height={size.height} />
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
      }}
    >
      {children}
    </div>
  );
}
