import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SplavFrame, SplavHostData, SplavRoundResult } from '@igra/shared';
import { socket } from '../../socket';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { SplavArena, type SplavRosterInfo } from './SplavArena';

/**
 * Splav on the TV. The arena is a plain canvas driven by `game:frame`, which
 * bypasses the React store entirely — pushing 15 positional updates a second
 * through zustand would re-render this tree 15×/s for nothing. React keeps
 * only what actually changes: the phase overlays, the roster and the toasts.
 */
export default function SplavHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arenaRef = useRef<SplavArena | null>(null);
  const elimSeqRef = useRef(0);
  const roundRef = useRef(0);
  const [toasts, setToasts] = useState<{ id: number; text: string; color: string }[]>([]);

  const host = gameState?.data.host as SplavHostData | undefined;
  const phase = gameState?.phase;

  // --- Canvas lifecycle ----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const arena = new SplavArena(canvas);
    arenaRef.current = arena;

    const parent = canvas.parentElement;
    const resize = () => {
      const rect = parent?.getBoundingClientRect();
      arena.resize(rect?.width ?? window.innerWidth, rect?.height ?? window.innerHeight);
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (parent) observer.observe(parent);

    return () => {
      observer.disconnect();
      arena.dispose();
      arenaRef.current = null;
    };
  }, []);

  // --- Frames --------------------------------------------------------------
  useEffect(() => {
    // Subscribed here rather than in App.tsx on purpose: frames must reach the
    // canvas without passing through the store.
    const onFrame = ({ gameId, frame }: { gameId: string; frame: unknown }) => {
      if (gameId !== 'splav') return;
      arenaRef.current?.pushFrame(frame as SplavFrame);
    };
    socket.on('game:frame', onFrame);
    return () => {
      socket.off('game:frame', onFrame);
    };
  }, []);

  const roster = useMemo(() => {
    const map: Record<string, SplavRosterInfo> = {};
    for (const p of host?.roster ?? []) {
      map[p.playerId] = { name: p.name, color: p.avatarColor, emoji: p.avatarEmoji };
    }
    return map;
  }, [host?.roster]);

  useEffect(() => {
    arenaRef.current?.setRoster(roster);
  }, [roster]);

  // Wipe the old raft when a new round is dealt.
  useEffect(() => {
    if (!host) return;
    if (roundRef.current !== host.round) {
      roundRef.current = host.round;
      arenaRef.current?.reset();
      setToasts([]);
    }
  }, [host]);

  // --- Eliminations: one toast + one sound each -----------------------------
  // Driven off the whole round's list rather than a "latest" field: two people
  // can go in on the same tick, and the shove that ends a round arrives with
  // the round result. Everything above the last seq we announced is new.
  useEffect(() => {
    const fresh = (host?.eliminations ?? []).filter((e) => e.seq > elimSeqRef.current);
    if (fresh.length === 0) return;
    elimSeqRef.current = fresh[fresh.length - 1].seq;

    play('wrong');
    setToasts((prev) =>
      [
        ...prev,
        ...fresh.map((elim) => ({
          id: elim.seq,
          text:
            elim.reason === 'guranje' && elim.by
              ? `${elim.by.name} je izgurao ${elim.victim.name}!`
              : elim.reason === 'odustao'
                ? `${elim.victim.name} je napustio splav`
                : `${elim.victim.name} je pao u vodu!`,
          color: elim.victim.avatarColor,
        })),
      ].slice(-3)
    );

    const ids = fresh.map((e) => e.seq);
    const timer = setTimeout(
      () => setToasts((prev) => prev.filter((t) => !ids.includes(t.id))),
      2600
    );
    return () => clearTimeout(timer);
  }, [host?.eliminations, play]);

  useEffect(() => {
    if (phase === 'runda-gotova') play('reveal');
    if (phase === 'ended') play('victory');
  }, [phase, play]);

  if (!gameState || !host) return null;

  const aliveCount = host.roster.filter((p) => p.alive).length;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />

      <div
        style={{
          position: 'absolute',
          top: '1.4rem',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '0.35rem 1.1rem',
          borderRadius: '999px',
          background: 'rgba(11, 28, 51, 0.72)',
          border: '1px solid var(--line2)',
          fontSize: '1rem',
          letterSpacing: '0.04em',
          color: 'var(--text-secondary)',
          backdropFilter: 'blur(6px)',
        }}
      >
        Runda {host.round}/{host.totalRounds}
        {phase === 'borba' && ` · na splavu: ${aliveCount}`}
      </div>

      {phase === 'borba' && <SideBoard host={host} />}

      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{
                padding: '0.5rem 1.3rem',
                borderRadius: '999px',
                background: 'rgba(11, 28, 51, 0.85)',
                border: `2px solid ${toast.color}`,
                fontSize: '1.3rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              💦 {toast.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <IntroCard key="intro" host={host} seconds={gameState.timeRemaining} />
        )}
        {phase === 'runda-gotova' && host.roundResult && (
          <RoundCard key="round" result={host.roundResult} />
        )}
        {(phase === 'rang-lista' || phase === 'ended') && (
          <Standings key="board" host={host} final={phase === 'ended'} />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Pieces ---------------------------------------------------------------

/** Live roster down the left edge — who's still up, and on how many points. */
function SideBoard({ host }: { host: SplavHostData }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '1.4rem',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
      }}
    >
      {host.roster.map((p) => (
        <div
          key={p.playerId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.3rem 0.8rem 0.3rem 0.3rem',
            borderRadius: '999px',
            background: 'rgba(11, 28, 51, 0.62)',
            border: `1px solid ${p.alive ? p.avatarColor : 'var(--line)'}`,
            opacity: p.alive ? 1 : 0.4,
            filter: p.alive ? 'none' : 'grayscale(1)',
            transition: 'opacity 300ms ease, filter 300ms ease',
          }}
        >
          <span
            style={{
              width: '2rem',
              height: '2rem',
              borderRadius: '50%',
              background: p.avatarColor,
              display: 'grid',
              placeItems: 'center',
              fontSize: '1.1rem',
            }}
          >
            {p.alive ? p.avatarEmoji : '💧'}
          </span>
          <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>{p.name}</span>
          <span style={{ fontSize: '0.95rem', color: 'var(--accent)', marginLeft: 'auto' }}>
            {p.score}
          </span>
        </div>
      ))}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.1rem',
        background:
          'radial-gradient(900px 560px at 50% 50%, rgba(11, 28, 51, 0.9), rgba(11, 28, 51, 0.62) 62%, rgba(11, 28, 51, 0.25))',
        backdropFilter: 'blur(2px)',
      }}
    >
      {children}
    </motion.div>
  );
}

function IntroCard({ host, seconds }: { host: SplavHostData; seconds: number }) {
  return (
    <Overlay>
      <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', letterSpacing: '0.12em' }}>
        RUNDA {host.round} OD {host.totalRounds}
      </p>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', margin: 0 }}>
        Splav se smanjuje!
      </h2>
      <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)' }}>
        Vozi džojstikom, guraj naletom — poslednji na splavu nosi rundu.
      </p>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '5rem',
          fontWeight: 800,
          color: 'var(--accent)',
        }}
      >
        {Math.max(1, seconds)}
      </div>
    </Overlay>
  );
}

function RoundCard({ result }: { result: SplavRoundResult }) {
  return (
    <Overlay>
      {result.winner ? (
        <>
          <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', letterSpacing: '0.12em' }}>
            RUNDA {result.round}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
            <span
              style={{
                width: '5rem',
                height: '5rem',
                borderRadius: '50%',
                background: result.winner.avatarColor,
                display: 'grid',
                placeItems: 'center',
                fontSize: '2.6rem',
              }}
            >
              {result.winner.avatarEmoji}
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '3.6rem', fontWeight: 800 }}>
              {result.winner.name}
            </span>
          </div>
          <p style={{ fontSize: '1.5rem', color: 'var(--accent)' }}>ostao je na splavu! 🛶</p>
        </>
      ) : (
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', margin: 0 }}>
          Splav je potonuo — nema pobednika runde
        </h2>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
          width: 'min(620px, 74%)',
          marginTop: '0.4rem',
        }}
      >
        {result.entries.map((e) => (
          <div
            key={e.playerId}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto auto 1fr auto auto',
              alignItems: 'center',
              gap: '0.8rem',
              padding: '0.4rem 0.9rem',
              borderRadius: '0.7rem',
              background: e.rank === 1 ? 'rgba(194, 155, 71, 0.16)' : 'rgba(11, 28, 51, 0.5)',
              border: `1px solid ${e.rank === 1 ? 'var(--accent)' : 'var(--line)'}`,
            }}
          >
            <span style={{ color: 'var(--text-secondary)', width: '1.6rem' }}>{e.rank}.</span>
            <span
              style={{
                width: '1.9rem',
                height: '1.9rem',
                borderRadius: '50%',
                background: e.avatarColor,
                display: 'grid',
                placeItems: 'center',
                fontSize: '1rem',
              }}
            >
              {e.avatarEmoji}
            </span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{e.name}</span>
            <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              {Math.round(e.survivedMs / 1000)}s
            </span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.3rem',
                color: 'var(--accent)',
                minWidth: '4rem',
                textAlign: 'right',
              }}
            >
              +{e.points}
            </span>
          </div>
        ))}
      </div>
    </Overlay>
  );
}

function Standings({ host, final }: { host: SplavHostData; final: boolean }) {
  return (
    <Overlay>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.8rem', margin: 0 }}>
        {final ? 'Konačni poredak' : 'Rang lista'}
      </h2>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          width: 'min(700px, 78%)',
        }}
      >
        {host.leaderboard?.map((entry) => (
          <motion.div
            key={entry.playerId}
            layout
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto auto 1fr auto auto',
              alignItems: 'center',
              gap: '0.9rem',
              padding: '0.6rem 1.1rem',
              borderRadius: '0.8rem',
              background: entry.rank === 1 ? 'rgba(194, 155, 71, 0.18)' : 'var(--bg-card)',
              border: `1px solid ${entry.rank === 1 ? 'var(--accent)' : 'var(--line)'}`,
            }}
          >
            <span style={{ fontSize: '1.3rem', width: '2rem', color: 'var(--text-secondary)' }}>
              {entry.rank}.
            </span>
            <span
              style={{
                width: '2.4rem',
                height: '2.4rem',
                borderRadius: '50%',
                background: entry.avatarColor,
                display: 'grid',
                placeItems: 'center',
                fontSize: '1.3rem',
              }}
            >
              {entry.avatarEmoji}
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{entry.name}</span>
            <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
              🛶 {entry.wins} · 🚜 {entry.eliminations}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.6rem',
                color: 'var(--accent)',
                minWidth: '4.5rem',
                textAlign: 'right',
              }}
            >
              {entry.score}
            </span>
          </motion.div>
        ))}
      </div>
    </Overlay>
  );
}
