import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RECONNECT_GRACE_MS } from '@igra/shared';
import { socket } from '../socket';
import { usePlayerStore } from '../store/playerStore';
import { leaveRoom } from '../leaveRoom';
import { useT } from '../i18n/useT';
import { cue } from '../utils/cues';

/** After this long without a connection the banner gives way to 4h. */
const GIVE_UP_MS = 15_000;
/** How long the green "Povezan" banner stays after a reconnect. */
const BACK_MS = 1500;

/**
 * Connection problems never throw the player out of the room (redizajn 4g/4h).
 * A drop shows a 64px banner in the knock banner's slot and dims the screen
 * in place — taps still go through, socket.io buffers them and sends them on
 * reconnect. After ~15 s it turns into a full "can't reach the room" screen
 * with a retry; a reconnect flashes a green "Povezan".
 */
export function ConnectionStatus() {
  const player = usePlayerStore((s) => s.player);
  const isConnected = usePlayerStore((s) => s.isConnected);
  const code = usePlayerStore((s) => s.room?.code ?? '');
  const t = useT();
  const offline = !!player && !isConnected;

  const [lost, setLost] = useState(false);
  const [back, setBack] = useState(false);
  // When the drop started — the seat-hold countdown on 4h runs from here.
  const droppedAt = useRef<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!offline) return;
    droppedAt.current ??= Date.now();
    const timer = setTimeout(() => setLost(true), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [offline, attempt]);

  useEffect(() => {
    if (offline || droppedAt.current === null) return;
    droppedAt.current = null;
    setLost(false);
    if (!player) return; // left the room, nothing to celebrate
    cue('reconnected');
    setBack(true);
    const timer = setTimeout(() => setBack(false), BACK_MS);
    return () => clearTimeout(timer);
  }, [offline, player]);

  if (offline && lost) {
    const left = Math.max(
      1,
      Math.ceil((RECONNECT_GRACE_MS - (Date.now() - (droppedAt.current ?? Date.now()))) / 60_000)
    );
    return (
      <ProblemScreen
        icon="📡"
        title={t('conn.lostTitle', { code })}
        body={t('conn.lostBody', { n: left })}
        primary={{
          label: t('conn.retry'),
          run: () => {
            setLost(false);
            setAttempt((n) => n + 1);
            if (!socket.connected) {
              socket.disconnect();
              socket.connect();
            }
          },
        }}
        secondary={{ label: t('conn.home'), run: () => leaveRoom() }}
      />
    );
  }

  if (!offline && !back) return null;

  return (
    <>
      {offline && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(22,46,78,.55)',
            zIndex: 990,
            pointerEvents: 'none',
            animation: 'igra-fade .2s ease',
          }}
        />
      )}
      <div
        role="status"
        style={{
          position: 'fixed',
          top: 'calc(10px + var(--safe-top, 0px))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 20px)',
          maxWidth: 500,
          height: 64,
          padding: '0 14px',
          borderRadius: 18,
          background: offline ? 'var(--amber)' : 'var(--success)',
          color: '#162e4e',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          zIndex: 995,
          boxShadow: '0 10px 30px rgba(0,0,0,.35)',
          animation: 'igra-banner-in .26s cubic-bezier(.22,1,.36,1)',
          pointerEvents: 'none',
        }}
      >
        {offline ? (
          <span
            aria-hidden
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              border: '3px solid rgba(22,46,78,.25)',
              borderTopColor: '#162e4e',
              flexShrink: 0,
              animation: 'igra-spin .8s linear infinite',
            }}
          />
        ) : (
          <span aria-hidden style={{ fontSize: '1.3rem', fontWeight: 800 }}>
            ✓
          </span>
        )}
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>
            {offline ? t('conn.reconnecting') : t('conn.back')}
          </span>
          {offline && (
            <span style={{ fontSize: '0.8rem', fontWeight: 700, opacity: 0.75 }}>
              {t('conn.kept')}
            </span>
          )}
        </span>
      </div>
    </>
  );
}

/**
 * Full-screen problem state (4h): icon, one headline, one sentence, and at
 * most two ways out. Also used for "kicked" / "room closed".
 */
export function ProblemScreen({
  icon,
  title,
  body,
  primary,
  secondary,
}: {
  icon: string;
  title: ReactNode;
  body?: ReactNode;
  primary: { label: string; run: () => void };
  secondary?: { label: string; run: () => void };
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background:
          'radial-gradient(1200px 700px at 50% -12%, rgba(194,155,71,.16), transparent 60%), var(--bg-primary)',
        display: 'flex',
        justifyContent: 'center',
        padding:
          'calc(24px + var(--safe-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px))',
        animation: 'igra-fade .2s ease',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--line2)',
              display: 'grid',
              placeItems: 'center',
              fontSize: '2.1rem',
            }}
          >
            {icon}
          </span>
          <span
            className="display"
            style={{ marginTop: 8, fontWeight: 700, fontSize: '2rem', lineHeight: 1.05 }}
          >
            {title}
          </span>
          {body && (
            <span style={{ fontSize: '0.95rem', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
              {body}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn-primary" onClick={primary.run}>
            {primary.label}
          </button>
          {secondary && (
            <button className="btn-ghost" onClick={secondary.run}>
              {secondary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
