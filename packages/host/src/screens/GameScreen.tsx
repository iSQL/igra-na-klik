import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GameRouter } from '../components/GameRouter';
import { socket } from '../socket';
import { useT } from '../i18n/useT';
import { useFlowStore } from '../store/flowStore';
import { useGameStore } from '../store/gameStore';

export function GameScreen() {
  const t = useT();
  const [stopping, setStopping] = useState(false);
  const flow = useFlowStore((s) => s.flow);

  // If the component ever remounts with leftover state, clear it.
  useEffect(() => {
    return () => setStopping(false);
  }, []);

  const handleStop = () => {
    if (stopping) return;
    setStopping(true);
    socket.emit('host:stop-game', { showResults: true });
  };

  const paused = !!flow?.paused;
  const togglePause = () => {
    if (flow?.resumeCountdown) return;
    socket.emit('host:flow-action', { action: paused ? 'resume' : 'pause' });
  };

  const corner: React.CSSProperties = {
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    minHeight: '40px',
    minWidth: '40px',
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          display: 'flex',
          gap: '0.5rem',
          // Above the pause overlay, so the TV can resume or end from it.
          zIndex: 1010,
        }}
      >
        <button
          onClick={togglePause}
          disabled={stopping || !flow || !!flow.resumeCountdown}
          style={{
            ...corner,
            background: paused ? 'var(--accent)' : 'var(--bg-card)',
            color: paused ? 'var(--bg-primary)' : 'var(--text-primary)',
            border: '1px solid var(--line2)',
            fontWeight: 700,
          }}
        >
          {paused ? `▶ ${t('flow.resume')}` : `⏸ ${t('flow.pause')}`}
        </button>
        <button
          onClick={handleStop}
          disabled={stopping}
          style={{
            ...corner,
            background: 'var(--danger)',
            color: '#fff',
            opacity: stopping ? 0.6 : 1,
            cursor: stopping ? 'not-allowed' : 'pointer',
          }}
        >
          {stopping ? t('overlay.endingGame') : t('overlay.endGame')}
        </button>
      </div>
      <GameRouter />
      <AnimatePresence>{paused && !stopping && <PauseOverlay key="pause" />}</AnimatePresence>
      {stopping && <StoppingOverlay />}
    </div>
  );
}

/**
 * Pauza na TV-u (Tok igre 1d): the game stays visible underneath, dimmed,
 * and the server's 3-2-1 plays over it before the clock runs again.
 */
function PauseOverlay() {
  const t = useT();
  const flow = useFlowStore((s) => s.flow);
  const timeRemaining = useGameStore((s) => s.gameState?.timeRemaining ?? 0);
  const countdown = flow?.resumeCountdown ?? null;
  const secs = Math.max(0, Math.round(timeRemaining));
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,22,40,.72)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.2rem',
        zIndex: 1000,
        textAlign: 'center',
      }}
    >
      {countdown ? (
        <motion.span
          key={countdown}
          className="display"
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 18 }}
          style={{ fontSize: '16rem', fontWeight: 800, lineHeight: 1, color: 'var(--accent)' }}
        >
          {countdown}
        </motion.span>
      ) : (
        <>
          <span
            aria-hidden
            style={{
              width: '9rem',
              height: '9rem',
              borderRadius: '50%',
              background: 'var(--text-primary)',
              color: 'var(--bg-primary)',
              display: 'grid',
              placeItems: 'center',
              fontSize: '3.6rem',
              fontWeight: 800,
            }}
          >
            ❚❚
          </span>
          <span className="display" style={{ fontSize: '5rem', fontWeight: 800, lineHeight: 1 }}>
            {t('flow.paused')}
          </span>
          <span style={{ fontSize: '1.6rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {flow?.pausedBy ? t('flow.pausedBy', { name: flow.pausedBy }) : t('flow.pausedByTv')}
            {timeRemaining > 0 ? ' ' + t('flow.clockAt', { time: clock }) : ''}
          </span>
        </>
      )}
    </motion.div>
  );
}

function StoppingOverlay() {
  const t = useT();
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          width: '72px',
          height: '72px',
          border: '6px solid rgba(255, 255, 255, 0.2)',
          borderTopColor: '#fff',
          borderRadius: '50%',
          animation: 'igra-spin 0.8s linear infinite',
        }}
      />
      <p style={{ fontSize: '1.5rem', color: '#fff', fontWeight: 500 }}>
        {t('overlay.endingGameFull')}
      </p>
    </div>
  );
}
