import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Full sweep of the power meter, ms. Slow enough to hit deliberately. */
const POWER_CYCLE_MS = 1150;

const wrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  padding: '0.9rem',
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

  if (phase === 'intro') {
    return (
      <div style={wrap}>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Runda {host.round}/{host.totalRounds}
        </p>
        <p style={{ fontSize: '1.9rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
          {role === 'shooter' ? '⚽ Ti šutiraš!' : role === 'keeper' ? '🧤 Ti braniš!' : 'Gledaj TV'}
        </p>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)' }}>
          {host.shooter.name} <span style={{ color: 'var(--accent)' }}>vs</span> {host.keeper.name}
        </p>
      </div>
    );
  }

  if (phase === 'aiming') {
    if (role === 'shooter') return <ShooterPad committed={my?.committed} seconds={timeRemaining} />;
    if (role === 'keeper')
      return <KeeperPad committed={my?.committed} chosen={my?.ownZone} seconds={timeRemaining} />;
    return (
      <div style={wrap}>
        <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>
          {host.shooter.name} šutira, {host.keeper.name} brani
        </p>
        <p style={{ fontSize: '2.4rem' }}>👀</p>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          Gledaj TV — ti si na redu kasnije.
        </p>
      </div>
    );
  }

  if (phase === 'shot') {
    return <ShotVerdict host={host} my={my} role={role} />;
  }

  // leaderboard / ended — the table itself is on the TV.
  return (
    <div style={wrap}>
      <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
        {phase === 'ended' ? 'Kraj!' : `Kraj runde ${host.round}`}
      </p>
      <p style={{ fontSize: '2.6rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
        {my?.score ?? 0}
      </p>
      <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>tvojih poena</p>
    </div>
  );
}

// --- Shooter --------------------------------------------------------------

function ShooterPad({ committed, seconds }: { committed?: boolean; seconds: number }) {
  const haptics = useHaptics();
  const padRef = useRef<HTMLDivElement>(null);
  const [aim, setAim] = useState<PenaliPoint | null>(null);
  const [power, setPower] = useState(0);
  const [holding, setHolding] = useState(false);
  const holdStartRef = useRef(0);
  const rafRef = useRef(0);
  const sentRef = useRef(false);

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

  const pointToAim = useCallback((clientX: number, clientY: number): PenaliPoint | null => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = 1 - (clientY - rect.top) / rect.height;
    return {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (committed || sentRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setAim(pointToAim(e.clientX, e.clientY));
    holdStartRef.current = performance.now();
    setPower(0);
    setHolding(true);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!holding) return;
    setAim(pointToAim(e.clientX, e.clientY));
  };

  const onUp = (e: React.PointerEvent) => {
    if (!holding) return;
    setHolding(false);
    const finalAim = pointToAim(e.clientX, e.clientY) ?? aim;
    if (!finalAim || sentRef.current) return;
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
        <p style={{ fontSize: '2.6rem' }}>⚽</p>
        <p style={{ fontSize: '1.4rem', fontWeight: 800 }}>Udarac je zadat!</p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Gledaj TV — golman još bira ugao.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '0.8rem',
        gap: '0.6rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>Nišani i pusti</span>
        <span
          style={{
            fontSize: '1.1rem',
            fontWeight: 800,
            color: seconds <= 3 ? 'var(--danger)' : 'var(--text-secondary)',
          }}
        >
          {seconds}s
        </span>
      </div>

      <div
        ref={padRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3 / 1',
          borderRadius: '0.5rem',
          border: '3px solid var(--text-primary)',
          borderBottomWidth: '5px',
          background:
            'repeating-linear-gradient(90deg, rgba(245,235,224,0.14) 0 1px, transparent 1px 14px), repeating-linear-gradient(0deg, rgba(245,235,224,0.14) 0 1px, transparent 1px 14px), rgba(22,46,78,0.55)',
          touchAction: 'none',
          overflow: 'hidden',
        }}
      >
        {aim && (
          <div
            style={{
              position: 'absolute',
              left: `${((aim.x + 1) / 2) * 100}%`,
              top: `${(1 - aim.y) * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: '2.6rem',
              height: '2.6rem',
              borderRadius: '50%',
              border: '3px solid var(--accent)',
              boxShadow: '0 0 0 2px rgba(22,46,78,0.6)',
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: '1rem' }}>⚽</span>
          </div>
        )}
        {!aim && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--text-secondary)',
              fontSize: '0.95rem',
              pointerEvents: 'none',
              padding: '0 1rem',
            }}
          >
            Drži prst na golu i pomeraj — pusti kad je snaga prava
          </div>
        )}
      </div>

      <div>
        <div
          style={{
            position: 'relative',
            height: '2.2rem',
            borderRadius: '0.5rem',
            overflow: 'hidden',
            background: 'var(--bg-card)',
            border: '1px solid var(--line)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: `${power * 100}%`,
              background: 'linear-gradient(90deg, var(--success), var(--amber), var(--danger))',
              transition: holding ? 'none' : 'width 120ms ease-out',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0 0.6rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: 'var(--text-primary)',
              mixBlendMode: 'difference',
            }}
          >
            <span>PRECIZNO</span>
            <span>SNAŽNO</span>
          </div>
        </div>
        <p
          style={{
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            marginTop: '0.35rem',
            textAlign: 'center',
          }}
        >
          Jače je teže odbraniti, ali lakše promašiti gol.
        </p>
      </div>
    </div>
  );
}

// --- Keeper ---------------------------------------------------------------

function KeeperPad({
  committed,
  chosen,
  seconds,
}: {
  committed?: boolean;
  chosen?: PenaliZone;
  seconds: number;
}) {
  const haptics = useHaptics();
  const sentRef = useRef(false);

  const pick = (zone: PenaliZone) => {
    if (committed || sentRef.current) return;
    sentRef.current = true;
    haptics.success();
    socket.emit('game:player-action', { action: 'penali:dive', data: { zone } });
  };

  if (committed) {
    return (
      <div style={wrap}>
        <p style={{ fontSize: '2.6rem' }}>🧤</p>
        <p style={{ fontSize: '1.4rem', fontWeight: 800 }}>
          {chosen ? ZONE_LABELS[chosen] : 'Ugao izabran'}
        </p>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Gledaj TV — šuter još nišani.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        padding: '0.8rem',
        gap: '0.6rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>Biraj ugao</span>
        <span
          style={{
            fontSize: '1.1rem',
            fontWeight: 800,
            color: seconds <= 3 ? 'var(--danger)' : 'var(--text-secondary)',
          }}
        >
          {seconds}s
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(2, 1fr)',
          gap: '0.5rem',
          flex: 1,
          padding: '0.5rem',
          borderRadius: '0.5rem',
          border: '3px solid var(--text-primary)',
          borderBottomWidth: '5px',
          background:
            'repeating-linear-gradient(90deg, rgba(245,235,224,0.12) 0 1px, transparent 1px 14px), rgba(22,46,78,0.55)',
        }}
      >
        {PENALI_ZONES.map((zone) => (
          <button
            key={zone}
            onClick={() => pick(zone)}
            style={{
              border: '2px solid var(--line2)',
              borderRadius: '0.5rem',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              fontWeight: 700,
              lineHeight: 1.2,
              padding: '0.3rem',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.2rem',
            }}
          >
            <span style={{ fontSize: '1.3rem' }}>
              {ZONE_CENTERS[zone].y > 0.5 ? '↗' : '↘'}
            </span>
            {ZONE_LABELS[zone]}
          </button>
        ))}
      </div>

      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
        Strane su kao na TV-u. Šuter te ne vidi — bacaj se naslepo.
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
  const good =
    (role === 'shooter' && shot.outcome === 'gol') ||
    (role === 'keeper' && shot.outcome === 'odbrana');

  return (
    <div style={wrap}>
      <p
        style={{
          fontSize: '2.2rem',
          fontWeight: 800,
          fontFamily: 'var(--font-display)',
          color: good ? 'var(--success)' : 'var(--text-primary)',
        }}
      >
        {outcomeLabel(shot.outcome)}
      </p>
      {role !== 'spectator' && (
        <p style={{ fontSize: '1.6rem', fontWeight: 800 }}>
          {points > 0 ? `+${points}` : '0'} poena
        </p>
      )}
      <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
        {shot.shooter.name} → {shot.keeper.name}
      </p>
    </div>
  );
}
