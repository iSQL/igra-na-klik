import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PenaliHostData, PenaliShotResult } from '@igra/shared';
import { outcomeLabel } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { PitchScene } from './PitchScene';

/** Stable identity for a turn, so effects don't re-fire on every tick. */
function turnKey(host: PenaliHostData): string {
  return `${host.round}:${host.turnInRound}`;
}

export default function PenaliHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PitchScene | null>(null);
  const playedShotRef = useRef<string | null>(null);
  const resetForTurnRef = useRef<string | null>(null);
  const [verdict, setVerdict] = useState<PenaliShotResult | null>(null);

  const host = gameState?.data.host as PenaliHostData | undefined;
  const phase = gameState?.phase;

  // --- three.js lifecycle -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new PitchScene(canvas);
    sceneRef.current = scene;

    const parent = canvas.parentElement;
    const resize = () => {
      const rect = parent?.getBoundingClientRect();
      scene.resize(rect?.width ?? window.innerWidth, rect?.height ?? window.innerHeight);
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (parent) observer.observe(parent);

    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Keeper wears the current keeper's avatar color, so the TV always shows
  // who is between the posts without reading the name.
  const keeperColor = host?.keeper.avatarColor;
  useEffect(() => {
    if (keeperColor) sceneRef.current?.setKeeperColor(keeperColor);
  }, [keeperColor]);

  // Reset the pitch for each new duel; replay the shot exactly once. The
  // gameState object is rebuilt on every server tick, so both branches are
  // keyed off the turn rather than object identity — otherwise reset() would
  // fire once a second all the way through the aiming phase.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !host) return;
    const key = turnKey(host);

    if (phase === 'intro' || phase === 'aiming') {
      if (resetForTurnRef.current !== key) {
        resetForTurnRef.current = key;
        playedShotRef.current = null;
        setVerdict(null);
        scene.reset();
      }
      return;
    }

    if (phase === 'shot' && host.shot && playedShotRef.current !== key) {
      playedShotRef.current = key;
      setVerdict(null);
      const shot = host.shot;
      scene.playShot(shot, () => {
        setVerdict(shot);
        if (shot.outcome === 'gol') play('correct');
        else if (shot.outcome === 'odbrana') play('reveal');
        else play('wrong');
      });
    }
  }, [phase, host, play]);

  useEffect(() => {
    if (phase === 'ended') play('victory');
  }, [phase, play]);

  if (!gameState || !host) return null;

  const showBoard = phase === 'leaderboard' || phase === 'ended';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />

      {/* Round / turn ticker */}
      <div
        style={{
          position: 'absolute',
          top: '1.4rem',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '0.35rem 1.1rem',
          borderRadius: '999px',
          background: 'rgba(22, 46, 78, 0.72)',
          border: '1px solid var(--line2)',
          fontSize: '1rem',
          letterSpacing: '0.04em',
          color: 'var(--text-secondary)',
          backdropFilter: 'blur(6px)',
        }}
      >
        Runda {host.round}/{host.totalRounds} · dvoboj {host.turnInRound}/{host.turnsInRound}
      </div>

      <AnimatePresence mode="wait">
        {phase === 'intro' && <IntroCard key="intro" host={host} />}
        {phase === 'aiming' && (
          <AimingBar key="aiming" host={host} seconds={gameState.timeRemaining} />
        )}
        {verdict && phase === 'shot' && <VerdictCard key="verdict" shot={verdict} />}
        {showBoard && <Standings key="board" host={host} final={phase === 'ended'} />}
      </AnimatePresence>
    </div>
  );
}

// --- Pieces ---------------------------------------------------------------

function Duellist({
  player,
  role,
  align,
}: {
  player: PenaliHostData['shooter'];
  role: string;
  align: 'left' | 'right';
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-end' : 'flex-start',
        gap: '0.3rem',
      }}
    >
      <span style={{ fontSize: '0.95rem', letterSpacing: '0.12em', color: 'var(--text-secondary)' }}>
        {role}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
        <span
          style={{
            width: '3.4rem',
            height: '3.4rem',
            borderRadius: '50%',
            background: player.avatarColor,
            display: 'grid',
            placeItems: 'center',
            fontSize: '1.8rem',
            order: align === 'left' ? 2 : 1,
          }}
        >
          {player.avatarEmoji}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.6rem',
            fontWeight: 700,
            order: align === 'left' ? 1 : 2,
          }}
        >
          {player.name}
        </span>
      </div>
    </div>
  );
}

function IntroCard({ host }: { host: PenaliHostData }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.2rem',
        background:
          'radial-gradient(900px 520px at 50% 50%, rgba(22, 46, 78, 0.86), rgba(22, 46, 78, 0.55) 60%, transparent)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: '2.4rem',
        }}
      >
        <Duellist player={host.shooter} role="ŠUTIRA" align="left" />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            color: 'var(--accent)',
          }}
        >
          vs
        </span>
        <Duellist player={host.keeper} role="BRANI" align="right" />
      </div>
      <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)' }}>
        Spremite telefone…
      </p>
    </motion.div>
  );
}

function AimingBar({ host, seconds }: { host: PenaliHostData; seconds: number }) {
  const chip = (label: string, ready: boolean | undefined) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1.1rem',
        borderRadius: '999px',
        background: ready ? 'rgba(87, 179, 128, 0.18)' : 'rgba(22, 46, 78, 0.72)',
        border: `1px solid ${ready ? 'var(--success)' : 'var(--line2)'}`,
        fontSize: '1.1rem',
      }}
    >
      <span>{ready ? '✓' : '⏳'}</span>
      {label}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '2.2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.9rem',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '3.4rem',
          fontWeight: 700,
          color: seconds <= 3 ? 'var(--danger)' : 'var(--text-primary)',
          textShadow: '0 4px 18px rgba(0,0,0,0.5)',
        }}
      >
        {seconds}
      </div>
      <div style={{ display: 'flex', gap: '0.8rem' }}>
        {chip(`${host.shooter.name} nišani`, host.shooterCommitted)}
        {chip(`${host.keeper.name} bira ugao`, host.keeperCommitted)}
      </div>
    </motion.div>
  );
}

function VerdictCard({ shot }: { shot: PenaliShotResult }) {
  const tone =
    shot.outcome === 'gol'
      ? 'var(--success)'
      : shot.outcome === 'odbrana'
        ? 'var(--blue)'
        : 'var(--danger)';

  const detail =
    shot.outcome === 'gol'
      ? `${shot.shooter.name} +${shot.shooterPoints}${shot.shooterPoints > 100 ? ' · pravo u ćošak!' : ''}`
      : shot.outcome === 'odbrana'
        ? `${shot.keeper.name} +${shot.keeperPoints}`
        : shot.outcome === 'stativa'
          ? 'Milimetri od gola — niko ne dobija poene'
          : `${shot.shooter.name} je poslao loptu u tribine`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '3rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.4rem',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '5.2rem',
          fontWeight: 800,
          color: tone,
          letterSpacing: '0.02em',
          textShadow: '0 6px 26px rgba(0,0,0,0.55)',
        }}
      >
        {outcomeLabel(shot.outcome)}
      </div>
      <div
        style={{
          padding: '0.45rem 1.3rem',
          borderRadius: '999px',
          background: 'rgba(22, 46, 78, 0.78)',
          border: '1px solid var(--line2)',
          fontSize: '1.25rem',
        }}
      >
        {detail}
      </div>
      {shot.keeperTimedOut && (
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          {shot.keeper.name} nije stigao da izabere ugao
        </div>
      )}
    </motion.div>
  );
}

function Standings({ host, final }: { host: PenaliHostData; final: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        background: 'rgba(22, 46, 78, 0.86)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.6rem' }}>
        {final ? 'Konačni poredak' : 'Rang lista'}
      </h2>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          width: 'min(680px, 80%)',
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
              ⚽ {entry.goals} · 🧤 {entry.saves}
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
    </motion.div>
  );
}
