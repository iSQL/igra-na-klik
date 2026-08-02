import { useCallback, useEffect, useRef, useState } from 'react';
import type { SplavControllerData, SplavFrame, SplavHostData } from '@igra/shared';
import { SPLAV_DASH_COOLDOWN_MS } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { useHaptics } from '../../hooks/useHaptics';
import { socket } from '../../socket';

/**
 * Splav on the phone: a thumb stick and one dash button.
 *
 * Input budget matters here — `game:player-action` is capped at 60/s per
 * socket. The stick emits at most every INPUT_INTERVAL_MS and only when the
 * vector actually moved, which lands around the same ~16/s that drawing
 * batches use; the dash goes out immediately because its timing IS the play.
 */
const INPUT_INTERVAL_MS = 60;
/** Movement below this (in stick radii) isn't worth a packet. */
const INPUT_EPSILON = 0.06;
/** Stick travel in px before the knob is at full deflection. */
const STICK_RADIUS = 62;

export default function SplavController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);

  if (!gameState || !playerId) return null;

  const { phase, data, playerData } = gameState;
  const host = data.host as SplavHostData;
  const my = playerData[playerId] as unknown as SplavControllerData | undefined;

  // Someone who joined after the game started has no body on the raft — say so
  // instead of showing them a dead joystick or a phantom "you're in the water".
  if (!host.roster.some((p) => p.playerId === playerId)) {
    return (
      <Centered>
        <p style={{ fontSize: '3rem' }}>👀</p>
        <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          Partija je počela bez tebe
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Gledaj TV — u sledećoj si.
        </p>
      </Centered>
    );
  }

  if (phase === 'borba') {
    return <Pad playerId={playerId} alive={my?.alive ?? false} my={my} />;
  }

  if (phase === 'intro') {
    return (
      <Centered>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds}
        </p>
        <p style={{ fontSize: '3rem' }}>🛶</p>
        <p style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          Spremi palčeve!
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', maxWidth: '18rem' }}>
          Levo voziš, desno je nalet. Samo nalet može nekoga da izgura — potroši
          ga u pravom trenutku.
        </p>
      </Centered>
    );
  }

  if (phase === 'runda-gotova') {
    const rank = my?.roundRank ?? 0;
    return (
      <Centered>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Kraj runde {host.round}
        </p>
        <p style={{ fontSize: '3rem' }}>{rank === 1 ? '🏆' : rank === 2 ? '🥈' : '💧'}</p>
        <p style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          {rank === 1 ? 'Ostao si na splavu!' : `${rank}. mesto`}
        </p>
        <p style={{ fontSize: '1.4rem', color: 'var(--accent)', fontWeight: 800 }}>
          +{my?.roundPoints ?? 0}
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Gledaj TV</p>
      </Centered>
    );
  }

  // rang-lista / ended — the table itself is on the TV.
  return (
    <Centered>
      <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
        {phase === 'ended' ? 'Kraj!' : 'Rang lista'}
      </p>
      <p style={{ fontSize: '2.6rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
        {my?.score ?? 0}
      </p>
      <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
        tvojih poena · 🚜 {my?.eliminations ?? 0}
      </p>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '0.9rem',
        gap: '0.6rem',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}

// --- The pad --------------------------------------------------------------

function Pad({
  playerId,
  alive,
  my,
}: {
  playerId: string;
  alive: boolean;
  my?: SplavControllerData;
}) {
  const haptics = useHaptics();
  const stickRef = useRef<HTMLDivElement>(null);

  // Live input lives in refs — re-rendering React on every thumb move would
  // fight the 60fps knob for frames.
  const vec = useRef({ x: 0, y: 0 });
  const sent = useRef({ x: 0, y: 0 });
  const stickPointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  // Cooldown comes from the server's frame (authoritative) but is animated
  // locally between frames, so the ring sweeps smoothly instead of stepping.
  const dashAt = useRef(-Infinity);
  const [ready, setReady] = useState(1);
  const [outNow, setOutNow] = useState(!alive);

  useEffect(() => setOutNow(!alive), [alive]);

  // Server frames: own cooldown + own elimination, nothing else is needed.
  useEffect(() => {
    const onFrame = ({ gameId, frame }: { gameId: string; frame: unknown }) => {
      if (gameId !== 'splav') return;
      const me = (frame as SplavFrame).players.find((p) => p.id === playerId);
      if (!me) return;
      if (me.cd < 1) {
        // Re-anchor the local clock to the server's view of the cooldown.
        dashAt.current = performance.now() - me.cd * SPLAV_DASH_COOLDOWN_MS;
      } else if (dashAt.current !== -Infinity) {
        dashAt.current = -Infinity;
      }
      setOutNow(me.out);
    };
    socket.on('game:frame', onFrame);
    return () => {
      socket.off('game:frame', onFrame);
    };
  }, [playerId]);

  // Cooldown ring animation.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (dashAt.current === -Infinity) {
        setReady((r) => (r === 1 ? r : 1));
        return;
      }
      const k = Math.min(1, (performance.now() - dashAt.current) / SPLAV_DASH_COOLDOWN_MS);
      setReady(k);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Throttled stick transmitter.
  useEffect(() => {
    const timer = setInterval(() => {
      const v = vec.current;
      const s = sent.current;
      if (Math.abs(v.x - s.x) < INPUT_EPSILON && Math.abs(v.y - s.y) < INPUT_EPSILON) return;
      sent.current = { ...v };
      socket.emit('game:player-action', { action: 'splav:input', data: { x: v.x, y: v.y } });
    }, INPUT_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      // Let go of the stick when the pad unmounts, or the body keeps steering.
      socket.emit('game:player-action', { action: 'splav:input', data: { x: 0, y: 0 } });
    };
  }, []);

  const applyStick = useCallback((clientX: number, clientY: number, from: { x: number; y: number }) => {
    let dx = (clientX - from.x) / STICK_RADIUS;
    let dy = (clientY - from.y) / STICK_RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    // Screen Y grows downward and so does the arena's — no flip needed; the
    // TV camera looks down the same axis the thumb pushes along.
    vec.current = { x: dx, y: dy };
    setKnob({ x: dx * STICK_RADIUS, y: dy * STICK_RADIUS });
  }, []);

  const onStickDown = (e: React.PointerEvent) => {
    if (outNow) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stickPointer.current = e.pointerId;
    const rect = stickRef.current?.getBoundingClientRect();
    // The stick materialises under the thumb rather than at a fixed spot —
    // there is no time to look for it mid-fight.
    const from = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: e.clientX, y: e.clientY };
    setOrigin(from);
    applyStick(e.clientX, e.clientY, from);
  };

  const onStickMove = (e: React.PointerEvent) => {
    if (stickPointer.current !== e.pointerId || !origin) return;
    applyStick(e.clientX, e.clientY, origin);
  };

  const onStickUp = (e: React.PointerEvent) => {
    if (stickPointer.current !== e.pointerId) return;
    stickPointer.current = null;
    vec.current = { x: 0, y: 0 };
    setKnob({ x: 0, y: 0 });
  };

  const dash = () => {
    if (outNow || ready < 1) return;
    dashAt.current = performance.now();
    setReady(0);
    haptics.tap();
    socket.emit('game:player-action', { action: 'splav:dash', data: {} });
  };

  if (outNow) {
    return (
      <Centered>
        <p style={{ fontSize: '3.4rem' }}>💧</p>
        <p style={{ fontSize: '1.7rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          U vodi si!
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          {my?.eliminatedBy ? 'Neko te je izgurao.' : 'Splav se povukao ispod tebe.'} Gledaj TV
          dok se runda ne završi.
        </p>
      </Centered>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        alignItems: 'center',
        height: '100%',
        width: '100%',
        padding: '0.6rem',
        gap: '0.6rem',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* Stick */}
      <div
        ref={stickRef}
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
        style={{
          position: 'relative',
          height: '100%',
          borderRadius: '1rem',
          border: '2px dashed var(--line2)',
          background: 'rgba(22, 46, 78, 0.35)',
          display: 'grid',
          placeItems: 'center',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: `${STICK_RADIUS * 2}px`,
            height: `${STICK_RADIUS * 2}px`,
            borderRadius: '50%',
            border: '2px solid var(--line2)',
            background: 'rgba(11, 28, 51, 0.5)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div
            style={{
              width: '4.4rem',
              height: '4.4rem',
              borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
              transform: `translate(${knob.x}px, ${knob.y}px)`,
              transition: stickPointer.current === null ? 'transform 140ms ease-out' : 'none',
              display: 'grid',
              placeItems: 'center',
              fontSize: '1.5rem',
            }}
          >
            🛶
          </div>
        </div>
        <span
          style={{
            position: 'absolute',
            bottom: '0.5rem',
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
            letterSpacing: '0.1em',
          }}
        >
          VOŽNJA
        </span>
      </div>

      {/* Dash */}
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          dash();
        }}
        style={{
          position: 'relative',
          height: '100%',
          borderRadius: '1rem',
          border: 'none',
          padding: 0,
          background: 'transparent',
          display: 'grid',
          placeItems: 'center',
          touchAction: 'none',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 'min(11rem, 42vw)',
            height: 'min(11rem, 42vw)',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            // Conic sweep = the cooldown ring; full circle means "go".
            background: `conic-gradient(var(--accent) ${ready * 360}deg, rgba(245,235,224,0.12) 0deg)`,
            transition: 'filter 120ms ease',
            filter: ready >= 1 ? 'drop-shadow(0 0 14px rgba(194,155,71,0.55))' : 'none',
          }}
        >
          <div
            style={{
              width: '84%',
              height: '84%',
              borderRadius: '50%',
              background: ready >= 1 ? 'var(--danger)' : 'var(--bg-card)',
              border: '2px solid var(--line2)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.15rem',
              color: 'var(--text-primary)',
              transition: 'background 160ms ease',
            }}
          >
            <span style={{ fontSize: '2.2rem' }}>💥</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.08em' }}>
              NALET
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}
