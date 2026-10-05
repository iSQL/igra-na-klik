import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  PenaliControllerData,
  PenaliHostData,
  PenaliPoint,
  PenaliZone,
} from '@igra/shared';
import { PENALI_ZONES, ZONE_CENTERS, ZONE_LABELS, outcomeLabel } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { useHaptics } from '../../hooks/useHaptics';
import { socket } from '../../socket';
import { GameFrame } from '../../components/kit/GameFrame';
import { RoundVerdict } from '../../components/kit/RoundVerdict';

/** Full sweep of the power meter, ms. Slow enough to hit deliberately. */
const POWER_CYCLE_MS = 1150;
/** Mirrors AIMING_DURATION on the server — drives the drain bar only. */
const AIMING_SECONDS = 12;
/** Above this the bar turns rust: the strongest shots can sail over the bar. */
const POWER_RISKY = 0.85;
/** Where the sight rests before the first drag (slightly below centre). */
const AIM_START: PenaliPoint = { x: 0, y: 0.4 };

const PITCH_BG =
  'repeating-linear-gradient(180deg, rgba(255,255,255,.04) 0 60px, transparent 60px 120px), #1f4a34';

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  padding: '1rem 0',
  gap: '0.7rem',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
};

export default function PenaliController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);

  if (!gameState || !playerId) return null;

  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as PenaliHostData;
  const my = playerData[playerId] as unknown as PenaliControllerData | undefined;
  const role = my?.role ?? 'spectator';
  const aiming = phase === 'aiming';

  let subtitle = phase === 'ended' ? 'Kraj igre' : `Runda ${host.round}/${host.totalRounds}`;
  if (aiming && role === 'shooter')
    subtitle = `Ti šutiraš · golman: ${host.keeper.name} ${host.keeper.avatarEmoji}`;
  if (aiming && role === 'keeper')
    subtitle = `Ti braniš · šuter: ${host.shooter.name} ${host.shooter.avatarEmoji}`;

  let body: ReactNode;
  if (phase === 'intro') {
    body = (
      <div style={wrap}>
        <span style={{ fontSize: '3.2rem', lineHeight: 1 }}>
          {role === 'shooter' ? '⚽' : role === 'keeper' ? '🧤' : '👀'}
        </span>
        <p className="display" style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>
          {role === 'shooter' ? 'Ti šutiraš!' : role === 'keeper' ? 'Ti braniš!' : 'Gledaj TV'}
        </p>
        <p style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
          {host.shooter.avatarEmoji} {host.shooter.name}{' '}
          <span style={{ color: 'var(--amber)' }}>vs</span> {host.keeper.avatarEmoji}{' '}
          {host.keeper.name}
        </p>
      </div>
    );
  } else if (aiming) {
    if (role === 'shooter') body = <ShooterPad committed={my?.committed} />;
    else if (role === 'keeper') body = <KeeperPad committed={my?.committed} chosen={my?.ownZone} />;
    else
      body = (
        <div style={wrap}>
          <span style={{ fontSize: '2.6rem' }}>👀</span>
          <p className="display" style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
            {host.shooter.name} šutira, {host.keeper.name} brani
          </p>
          <p style={{ fontSize: '0.95rem', opacity: 0.8, margin: 0 }}>
            Gledaj TV — ti si na redu kasnije.
          </p>
        </div>
      );
  } else if (phase === 'shot') {
    body = <ShotVerdict host={host} my={my} role={role} />;
  } else {
    // leaderboard / ended — the table itself is on the TV.
    body = (
      <div style={wrap}>
        <span className="display" style={{ fontSize: '3rem', fontWeight: 800, lineHeight: 1 }}>
          {my?.score ?? 0}
        </span>
        <p style={{ fontSize: '0.95rem', opacity: 0.8, margin: 0 }}>
          tvojih poena · tabela je na TV-u
        </p>
      </div>
    );
  }

  return (
    <>
      {/* The pitch covers the whole phone, header included. */}
      <div
        aria-hidden
        style={{ position: 'fixed', inset: 0, background: PITCH_BG, pointerEvents: 'none' }}
      />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        <GameFrame
          gameId="penali"
          subtitle={subtitle}
          timeRemaining={aiming && role !== 'spectator' ? timeRemaining : undefined}
          timeTotal={aiming && role !== 'spectator' ? AIMING_SECONDS : undefined}
          roundKey={aiming ? `${host.round}:${host.turnInRound}` : undefined}
        >
          {body}
        </GameFrame>
      </div>
    </>
  );
}

// --- Shooter --------------------------------------------------------------

/**
 * The thumb drags on a pad at the bottom and moves the sight on the goal
 * above, so the finger never covers the target. Holding sweeps the power
 * bar; letting go shoots.
 */
function ShooterPad({ committed }: { committed?: boolean }) {
  const haptics = useHaptics();
  const padRef = useRef<HTMLDivElement>(null);
  const [aim, setAim] = useState<PenaliPoint>(AIM_START);
  const [power, setPower] = useState(0);
  const [holding, setHolding] = useState(false);
  const holdStartRef = useRef(0);
  const rafRef = useRef(0);
  const sentRef = useRef(false);
  // Drag anchor: where the finger went down and where the sight was then.
  const dragRef = useRef<{ x: number; y: number; aim: PenaliPoint } | null>(null);

  // Power sweeps 0 → 1 → 0 for as long as the finger is down; the release
  // moment is the choice. Deliberately a timing skill, not another slider.
  useEffect(() => {
    if (!holding) return;
    const tick = () => {
      const elapsed = performance.now() - holdStartRef.current;
      const t = (elapsed % POWER_CYCLE_MS) / POWER_CYCLE_MS;
      setPower(t < 0.5 ? t * 2 : 2 - t * 2);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [holding]);

  const aimFrom = useCallback((clientX: number, clientY: number): PenaliPoint | null => {
    const d = dragRef.current;
    const rect = padRef.current?.getBoundingClientRect();
    if (!d || !rect) return null;
    // Crossing the pad's width sweeps the whole goal; its height, the goal's.
    const x = d.aim.x + ((clientX - d.x) / rect.width) * 2;
    const y = d.aim.y - (clientY - d.y) / rect.height;
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (committed || sentRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, aim };
    holdStartRef.current = performance.now();
    setPower(0);
    setHolding(true);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!holding) return;
    const next = aimFrom(e.clientX, e.clientY);
    if (next) setAim(next);
  };

  const onUp = (e: React.PointerEvent) => {
    if (!holding) return;
    setHolding(false);
    const finalAim = aimFrom(e.clientX, e.clientY) ?? aim;
    dragRef.current = null;
    if (sentRef.current) return;
    sentRef.current = true;
    haptics.success();
    socket.emit('game:player-action', {
      action: 'penali:shoot',
      data: { aim: finalAim, power },
    });
  };

  if (committed) {
    return (
      <div style={wrap}>
        <span style={{ fontSize: '2.8rem' }}>⚽</span>
        <p className="display" style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
          Udarac je zadat!
        </p>
        <p style={{ fontSize: '0.95rem', opacity: 0.85, margin: 0 }}>
          Gledaj TV — golman još bira ugao.
        </p>
      </div>
    );
  }

  const risky = power > POWER_RISKY;
  const sightPos = {
    left: `${((aim.x + 1) / 2) * 100}%`,
    top: `${(1 - aim.y) * 100}%`,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        paddingTop: 20,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', flexShrink: 0 }}>
        <Goal>
          <span
            style={{
              position: 'absolute',
              ...sightPos,
              width: 44,
              height: 44,
              margin: -22,
              borderRadius: '50%',
              border: '3px solid var(--amber)',
              boxShadow: '0 0 0 6px rgba(227,180,94,.25)',
              pointerEvents: 'none',
            }}
          />
          <span
            style={{
              position: 'absolute',
              ...sightPos,
              width: 8,
              height: 8,
              margin: -4,
              borderRadius: '50%',
              background: 'var(--amber)',
              pointerEvents: 'none',
            }}
          />
        </Goal>
        <div
          aria-label="Snaga"
          style={{
            width: 28,
            borderRadius: 14,
            background: 'rgba(11,22,40,.45)',
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: `${power * 100}%`,
              background: risky
                ? 'var(--danger)'
                : 'linear-gradient(0deg, var(--lime) 0%, var(--amber) 60%, var(--danger) 100%)',
              transition: holding ? 'none' : 'height 120ms ease-out',
            }}
          />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          fontSize: '0.75rem',
          fontWeight: 800,
          opacity: 0.8,
          flexShrink: 0,
        }}
      >
        <span>Nišan</span>
        <span style={{ color: risky ? 'var(--danger)' : undefined }}>
          {risky ? 'Preko gola!' : 'Snaga'}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 12 }} />
      <div
        ref={padRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          height: 'min(200px, 30vh)',
          flexShrink: 0,
          borderRadius: 28,
          background: holding ? 'rgba(11,22,40,.5)' : 'rgba(11,22,40,.35)',
          border: '2px dashed rgba(250,246,240,.3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          textAlign: 'center',
          touchAction: 'none',
        }}
      >
        <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>👆</span>
        <span className="display" style={{ fontWeight: 700, fontSize: '1.35rem' }}>
          Drži i pomeraj
        </span>
        <span style={{ fontSize: '0.88rem', fontWeight: 600, opacity: 0.85 }}>
          Pusti kad je snaga prava
        </span>
      </div>
    </div>
  );
}

/** Goal frame with net — the shooter's target and the keeper's six corners. */
function Goal({ children, grid }: { children: ReactNode; grid?: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        height: 'min(240px, 34vh)',
        border: '6px solid var(--text-primary)',
        borderBottom: 'none',
        borderRadius: '6px 6px 0 0',
        backgroundImage:
          'linear-gradient(rgba(250,246,240,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(250,246,240,.12) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
        ...(grid
          ? {
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(2, 1fr)',
              gap: 6,
              padding: 6,
            }
          : {}),
      }}
    >
      {children}
    </div>
  );
}

// --- Keeper ---------------------------------------------------------------

/** Same goal, split into the six corners (3×2) — one blind pick. */
function KeeperPad({ committed, chosen }: { committed?: boolean; chosen?: PenaliZone }) {
  const haptics = useHaptics();
  const sentRef = useRef(false);

  const pick = (zone: PenaliZone) => {
    if (committed || sentRef.current) return;
    sentRef.current = true;
    haptics.success();
    socket.emit('game:player-action', { action: 'penali:dive', data: { zone } });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        paddingTop: 20,
        gap: 12,
      }}
    >
      <div style={{ display: 'flex' }}>
        <Goal grid>
          {PENALI_ZONES.map((zone) => {
            const mine = !!committed && chosen === zone;
            return (
              <button
                key={zone}
                onClick={() => pick(zone)}
                disabled={committed}
                style={{
                  minHeight: 0,
                  border: mine ? '3px solid var(--amber)' : '2px solid rgba(250,246,240,.25)',
                  borderRadius: 12,
                  background: mine ? 'rgba(227,180,94,.3)' : 'rgba(11,22,40,.4)',
                  color: 'var(--text-primary)',
                  opacity: committed && !mine ? 0.35 : 1,
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  padding: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                }}
              >
                <span style={{ fontSize: '1.3rem' }}>
                  {mine ? '🧤' : ZONE_CENTERS[zone].y > 0.5 ? '↗' : '↘'}
                </span>
                {ZONE_LABELS[zone]}
              </button>
            );
          })}
        </Goal>
      </div>
      <div style={{ flex: 1 }} />
      <p style={{ fontSize: '0.95rem', fontWeight: 700, textAlign: 'center', margin: 0, opacity: 0.9 }}>
        {committed
          ? 'Gledaj TV — šuter još nišani.'
          : 'Strane su kao na TV-u. Šuter te ne vidi — bacaj se naslepo.'}
      </p>
    </div>
  );
}

// --- Shot verdict ---------------------------------------------------------

function ShotVerdict({
  host,
  my,
  role,
}: {
  host: PenaliHostData;
  my?: PenaliControllerData;
  role: string;
}) {
  const shot = host.shot;
  if (!shot) return null;

  const points = my?.ownShotPoints ?? 0;
  const playing = role !== 'spectator';
  const good =
    (role === 'shooter' && shot.outcome === 'gol') ||
    (role === 'keeper' && shot.outcome === 'odbrana');

  return (
    <div style={wrap}>
      <RoundVerdict
        kind={!playing ? 'neutral' : good ? 'correct' : 'wrong'}
        icon={shot.outcome === 'gol' ? '⚽' : shot.outcome === 'odbrana' ? '🧤' : undefined}
        title={outcomeLabel(shot.outcome)}
        points={playing ? points : undefined}
      />
      <p style={{ fontSize: '0.95rem', opacity: 0.85, margin: 0 }}>
        {shot.shooter.name} → {shot.keeper.name}
      </p>
    </div>
  );
}
