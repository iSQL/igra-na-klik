import { useT } from '../i18n/useT';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';
import { flowAction, formatClock, useFlowStore } from '../store/flowStore';
import { PlayerMenu } from './PlayerMenu';

/**
 * Pauza (Tok igre 1d). The game stays visible underneath, dimmed, so
 * everyone knows where they stopped; answers are locked server-side. The
 * holder resumes from here, and a 3-2-1 covers the screen before the clock
 * runs again. The player menu stays reachable (leave, rules, end game).
 */
export function PauseOverlay() {
  const t = useT();
  const flow = useFlowStore((s) => s.flow);
  const me = usePlayerStore((s) => s.player);
  const room = usePlayerStore((s) => s.room);
  const timeRemaining = useGameStore((s) => s.gameState?.timeRemaining ?? 0);

  if (!flow?.paused) return null;
  const iAmHolder = !!me && room?.remoteHostPlayerId === me.id;

  if (flow.resumeCountdown) {
    return (
      <div
        aria-live="assertive"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(11,22,40,.78)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <span
          key={flow.resumeCountdown}
          className="display"
          style={{
            fontWeight: 800,
            fontSize: '9rem',
            lineHeight: 1,
            color: 'var(--accent)',
            animation: 'igra-pop .35s',
          }}
        >
          {flow.resumeCountdown}
        </span>
      </div>
    );
  }

  const line = flow.pausedBy
    ? t('flow.pausedBy', { name: flow.pausedBy })
    : t('flow.pausedByTv');
  const clock = timeRemaining > 0 ? ' ' + t('flow.clockAt', { time: formatClock(timeRemaining) }) : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('flow.paused')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(11,22,40,.72)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        animation: 'igra-fade .18s ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 'calc(16px + var(--safe-top))',
          right: 'calc(16px + var(--safe-right))',
        }}
      >
        <PlayerMenu inGame variant="header" />
      </div>
      <span
        aria-hidden
        style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          background: 'var(--text-primary)',
          color: 'var(--bg-primary)',
          display: 'grid',
          placeItems: 'center',
          fontSize: '2.4rem',
          fontWeight: 800,
        }}
      >
        ❚❚
      </span>
      <span className="display" style={{ fontWeight: 800, fontSize: '2.25rem', lineHeight: 1 }}>
        {t('flow.paused')}
      </span>
      <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', maxWidth: 300 }}>
        {line}
        {clock}
      </span>
      {iAmHolder && (
        <div
          style={{
            position: 'absolute',
            left: 'calc(20px + var(--safe-left))',
            right: 'calc(20px + var(--safe-right))',
            bottom: 'calc(28px + var(--safe-bottom))',
            maxWidth: 480,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--amber)',
            }}
          >
            {t('flow.onlyHostSees')}
          </span>
          <button
            onClick={() => flowAction('resume')}
            style={{
              height: 56,
              borderRadius: 16,
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              border: 'none',
              fontWeight: 800,
              fontSize: '1.05rem',
            }}
          >
            {t('flow.resumeGame')}
          </button>
        </div>
      )}
    </div>
  );
}
