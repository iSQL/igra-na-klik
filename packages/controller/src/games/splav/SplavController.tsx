import { useCallback, useEffect, useRef, useState } from 'react';
import type { SplavControllerData, SplavFrame, SplavHostData } from '@igra/shared';
import { SPLAV_DASH_COOLDOWN_MS } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { useHaptics } from '../../hooks/useHaptics';
import { socket } from '../../socket';
import { GameFrame, useHideFloatingMenu } from '../../components/kit/GameFrame';
import { PlayerMenu } from '../../components/PlayerMenu';
import { RoundVerdict, verdictWash } from '../../components/kit/RoundVerdict';

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
    const me = host.roster.find((p) => p.playerId === playerId);
    return (
      <Pad
        playerId={playerId}
        alive={my?.alive ?? false}
        my={my}
        aliveCount={host.roster.filter((p) => p.alive).length}
        total={host.roster.length}
        avatar={me}
      />
    );
  }

  return (
    <GameFrame
      gameId="splav"
      subtitle={phase === 'ended' ? 'Kraj igre' : `Runda ${host.round}/${host.totalRounds}`}
    >
      <Between phase={phase} my={my} />
    </GameFrame>
  );
}

function Between({ phase, my }: { phase: string; my?: SplavControllerData }) {

  if (phase === 'intro') {
    return (
      <Centered>
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
    // Place and points arrive here, at the end of the round — not while the
    // player is still dripping on "U vodi si!".
    return (
      <Centered wash={verdictWash(rank === 1 ? 'correct' : 'neutral')}>
        <RoundVerdict
          kind={rank === 1 ? 'correct' : 'neutral'}
          icon={rank === 1 ? '🏆' : rank === 2 ? '🥈' : '💧'}
          title={rank === 1 ? 'Ostao si na splavu!' : `${rank}. mesto`}
          points={my?.roundPoints ?? 0}
          total={my?.score ?? 0}
        />
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>Gledaj TV</p>
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

function Centered({ children, wash }: { children: React.ReactNode; wash?: string }) {
  return (
    <div
      style={{
        position: 'relative',
        background: wash,
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
  aliveCount,
  total,
  avatar,
}: {
  playerId: string;
  alive: boolean;
  my?: SplavControllerData;
  aliveCount: number;
  total: number;
  avatar?: { avatarColor: string; avatarEmoji: string };
}) {
  const haptics = useHaptics();
  // No GameFrame mid-fight (both halves are input) — the menu sits in the
  // top-right corner instead of floating over NALET.
  useHideFloatingMenu();
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

  const menu = (
    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}>
      <PlayerMenu inGame variant="header" />
    </div>
  );

  if (outNow) {
    return (
      <Centered wash="radial-gradient(600px 360px at 50% 0%, rgba(109,155,209,.22), transparent)">
        {menu}
        <p style={{ fontSize: '3.4rem', margin: 0 }}>💧</p>
        <p className="display" style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>
          U vodi si!
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
          {my?.eliminatedBy ? 'Neko te je izgurao.' : 'Splav se povukao ispod tebe.'} Mesto i
          poeni stižu na kraju runde.
        </p>
      </Centered>
    );
  }

  const full = ready >= 1;

  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        height: '100%',
        width: '100%',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {menu}
      {/* Stick — the thumb can start anywhere in the left half. */}
      <div
        ref={stickRef}
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
        style={{
          position: 'relative',
          height: '100%',
          borderRight: '1px solid var(--line)',
          display: 'grid',
          placeItems: 'center',
          touchAction: 'none',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            pointerEvents: 'none',
          }}
        >
          {avatar && (
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: '30%',
                background: avatar.avatarColor,
                display: 'grid',
                placeItems: 'center',
                fontSize: '1.05rem',
              }}
            >
              {avatar.avatarEmoji}
            </span>
          )}
          <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>
            Na splavu · {aliveCount} od {total}
          </span>
        </span>
        <div
          style={{
            position: 'relative',
            width: `${STICK_RADIUS * 2 + 56}px`,
            height: `${STICK_RADIUS * 2 + 56}px`,
            borderRadius: '50%',
            border: '2px solid var(--line2)',
            background: 'rgba(245,235,224,.05)',
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'var(--text-primary)',
              boxShadow: '0 8px 20px rgba(0,0,0,.35)',
              transform: `translate(${knob.x}px, ${knob.y}px)`,
              transition: stickPointer.current === null ? 'transform 140ms ease-out' : 'none',
            }}
          />
        </div>
        <span
          style={{
            position: 'absolute',
            bottom: 14,
            fontSize: '0.8rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            pointerEvents: 'none',
          }}
        >
          Palac bilo gde na levoj strani
        </span>
      </div>

      {/* Dash — the ring fills while it recharges; gold with a glow when full. */}
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          dash();
        }}
        aria-label="Nalet"
        style={{
          position: 'relative',
          height: '100%',
          minHeight: 0,
          border: 'none',
          borderRadius: 0,
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
            width: 'min(12.5rem, 40vw, 62vh)',
            height: 'min(12.5rem, 40vw, 62vh)',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: `conic-gradient(var(--amber) ${ready * 360}deg, rgba(245,235,224,0.1) 0deg)`,
            filter: full ? 'drop-shadow(0 0 18px rgba(227,180,94,0.6))' : 'none',
            transition: 'filter 160ms ease',
          }}
        >
          <div
            className="display"
            style={{
              width: '89%',
              height: '89%',
              borderRadius: '50%',
              background: full ? 'var(--accent)' : 'var(--bg-card)',
              color: full ? 'var(--bg-primary)' : 'var(--dim)',
              boxShadow: full ? 'inset 0 -8px 0 rgba(22,46,78,.18)' : 'none',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              fontSize: '1.9rem',
              letterSpacing: '0.06em',
              transition: 'background 160ms ease, color 160ms ease',
            }}
          >
            NALET
          </div>
        </div>
        <span
          style={{
            position: 'absolute',
            bottom: 14,
            fontSize: '0.8rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
          }}
        >
          Puni se ~2 s
        </span>
      </button>
    </div>
  );
}
