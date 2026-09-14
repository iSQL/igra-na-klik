import { useEffect, useRef, useState } from 'react';
import type { PuzlaFrame, PuzlaHostData } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { useHaptics } from '../../hooks/useHaptics';
import { socket } from '../../socket';
import { PuzlaStage } from './PuzlaStage';
import { PuzlaTable, buildPuzlaSprites, loadPuzlaImage } from './puzlaTable';

/** How often a drag position may go out — well inside the 60/s action budget. */
const MOVE_INTERVAL_MS = 66;
/** Table units; smaller drags aren't worth a packet. */
const MOVE_EPSILON = 0.0008;
/** A drop the server hasn't confirmed by then is sent again. */
const DROP_RETRY_MS = 800;

/**
 * Puzla on the phone: the whole table, full-screen, with your own finger on
 * the pieces. Unlike most games this renders the board in TV rooms too — it
 * is the controller; the TV only mirrors it.
 */
export default function PuzlaController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const hostless = usePlayerStore((s) => !!s.room?.hostless);

  if (!gameState || !playerId) return null;
  const host = gameState.data.host as PuzlaHostData;
  const phase = gameState.phase;

  if (phase === 'pregled') {
    return <Preview host={host} seconds={gameState.timeRemaining} />;
  }
  if (phase === 'slaganje') {
    return <Board host={host} playerId={playerId} timeRemaining={gameState.timeRemaining} />;
  }
  return <Finale host={host} playerId={playerId} hostless={hostless} />;
}

// --- pregled ---------------------------------------------------------------------

function Preview({ host, seconds }: { host: PuzlaHostData; seconds: number }) {
  return (
    <Centered>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
        {host.total} komadića{host.rotation ? ' · okrenuti' : ''}
      </p>
      <p style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-display)', margin: 0 }}>
        Zapamti sliku!
      </p>
      {/* Also warms the browser cache before the board cuts its sprites. */}
      <img
        src={host.imageUrl}
        alt=""
        style={{
          maxWidth: '100%',
          maxHeight: '55vh',
          borderRadius: '12px',
          border: '2px solid var(--accent)',
        }}
      />
      <p style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--accent)', margin: 0 }}>
        {Math.max(1, seconds)}
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '19rem', margin: 0 }}>
        Prstom vučeš komadić, jednim prstom po stolu pomeraš pogled, dva prsta zumiraju.
        {host.rotation && ' Tap na komadić ga okreće.'}
      </p>
    </Centered>
  );
}

// --- slaganje --------------------------------------------------------------------

function Board({
  host,
  playerId,
  timeRemaining,
}: {
  host: PuzlaHostData;
  playerId: string;
  timeRemaining: number;
}) {
  const haptics = useHaptics();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableRef = useRef(new PuzlaTable());
  const stageRef = useRef<PuzlaStage | null>(null);
  const pendingMove = useRef<{ gid: number; x: number; y: number } | null>(null);
  const sentMove = useRef<{ gid: number; x: number; y: number } | null>(null);
  const pendingDrop = useRef<{ gid: number; x: number; y: number; at: number; tries: number } | null>(null);
  const eventSeqRef = useRef<number | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [peek, setPeek] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1400);
  };

  const emit = (action: string, data: Record<string, unknown>) =>
    socket.emit('game:player-action', { action, data });

  // Apply the first state before the stage mounts, so its first frame can fit the view.
  if (!tableRef.current.geo) tableRef.current.applyState(host);

  // --- stage -------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = new PuzlaStage(canvas, tableRef.current, playerId, host.rotation, {
      onGrab: (gid) => {
        pendingDrop.current = null;
        emit('puzla:grab', { groupId: gid });
        haptics.tap();
      },
      onMove: (gid, x, y) => {
        pendingMove.current = { gid, x, y };
      },
      onDrop: (gid, x, y) => {
        pendingMove.current = null;
        sentMove.current = null;
        pendingDrop.current = { gid, x, y, at: performance.now(), tries: 0 };
        emit('puzla:drop', { groupId: gid, x, y });
      },
      onRotate: (gid, piece) => {
        emit('puzla:rotate', { groupId: gid, piece });
        haptics.tap();
      },
      onBlocked: () => {
        haptics.tap();
        showToast('Taj komadić drži neko drugi');
      },
    });
    stageRef.current = stage;
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
    // The stage lives for the whole slaganje phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- image → sprites ----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    loadPuzlaImage(host.imageUrl)
      .then((img) => {
        if (!cancelled) setImage(img);
      })
      .catch(() => showToast('Slika se nije učitala'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.imageUrl]);

  useEffect(() => {
    const geo = tableRef.current.geo;
    if (!image || !geo) return;
    // 2048² keeps the atlas inside what low-end iPhones allow per canvas.
    stageRef.current?.setSprites(buildPuzlaSprites(geo, image, 2048));
  }, [image]);

  // --- state -----------------------------------------------------------------------------
  useEffect(() => {
    const table = tableRef.current;
    table.applyState(host);

    const gid = table.localGroup;
    if (gid !== null) {
      const exists = table.groups.has(gid);
      const holder = host.holders[String(gid)];
      const lost = !exists || (holder !== undefined && holder !== playerId);
      const dropped = pendingDrop.current?.gid === gid && holder === undefined;
      if (lost || dropped) {
        if (lost && !pendingDrop.current) {
          stageRef.current?.cancelDrag();
          showToast('Neko je bio brži');
        }
        table.localGroup = null;
        pendingDrop.current = null;
        table.applyState(host); // now without our override
      }
    }

    const colors: Record<string, string> = {};
    for (const p of host.roster) colors[p.playerId] = p.avatarColor;
    stageRef.current?.setColors(colors);

    const ev = host.lastEvent;
    if (eventSeqRef.current === null) {
      eventSeqRef.current = ev?.seq ?? 0;
    } else if (ev && ev.seq > eventSeqRef.current) {
      eventSeqRef.current = ev.seq;
      stageRef.current?.addFlash({
        x: ev.x,
        y: ev.y,
        kind: ev.kind,
        color: colors[ev.playerId] ?? '#F2CE74',
        startedAt: performance.now(),
      });
      if (ev.playerId === playerId) {
        if (ev.kind === 'ram') haptics.success();
        else haptics.tap();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  // --- frames ------------------------------------------------------------------------------
  useEffect(() => {
    const onFrame = ({ gameId, frame }: { gameId: string; frame: unknown }) => {
      if (gameId !== 'puzla') return;
      const f = frame as PuzlaFrame;
      const table = tableRef.current;
      table.applyFrame(f);
      const gid = table.localGroup;
      if (gid === null) return;
      const entry = f.held.find((e) => e[0] === gid);
      if (entry && entry[4] !== playerId) {
        // Server gave it to someone else first — let go.
        stageRef.current?.cancelDrag();
        table.localGroup = null;
        pendingDrop.current = null;
        table.applyFrame({ ...f, seq: f.seq + 0.5 });
        showToast('Neko je bio brži');
      } else if (!entry && pendingDrop.current?.gid === gid) {
        // The drop landed; its full state already arrived ahead of this frame.
        table.localGroup = null;
        pendingDrop.current = null;
        table.version++;
      }
    };
    socket.on('game:frame', onFrame);
    return () => {
      socket.off('game:frame', onFrame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  // --- move sender + drop retry ----------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      const m = pendingMove.current;
      const s = sentMove.current;
      if (m && (!s || s.gid !== m.gid || Math.abs(m.x - s.x) + Math.abs(m.y - s.y) > MOVE_EPSILON)) {
        emit('puzla:move', { groupId: m.gid, x: m.x, y: m.y });
        sentMove.current = { ...m };
      }
      const d = pendingDrop.current;
      if (d && performance.now() - d.at > DROP_RETRY_MS) {
        if (d.tries < 2) {
          d.tries += 1;
          d.at = performance.now();
          emit('puzla:drop', { groupId: d.gid, x: d.x, y: d.y });
        } else {
          // The server has long since let go (a retried drop that already
          // landed gets no answer) — stop overriding its positions.
          const table = tableRef.current;
          pendingDrop.current = null;
          table.localGroup = null;
          table.version++;
        }
      }
    }, MOVE_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elapsed = useElapsed(host.elapsedSec);
  const clock = host.timeLimitSec !== null ? formatClock(timeRemaining) : formatClock(elapsed);
  const lowTime = host.timeLimitSec !== null && timeRemaining <= 30;
  const me = host.roster.find((p) => p.playerId === playerId);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        background: '#0B1728',
        touchAction: 'none',
        overscrollBehavior: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block', touchAction: 'none' }} />

      {/* HUD */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(0.5rem + var(--safe-top, 0px))',
          left: '0.6rem',
          right: '0.6rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          pointerEvents: 'none',
        }}
      >
        <Chip>
          🖼️ {host.lockedCount}/{host.total}
        </Chip>
        <div style={{ flex: 1 }} />
        {me && <Chip>⭐ {me.score}</Chip>}
        <Chip danger={lowTime}>
          {host.timeLimitSec === null ? '⏱' : '⏳'} {clock}
        </Chip>
      </div>

      {toast && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(3.2rem + var(--safe-top, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '0.35rem 0.9rem',
            borderRadius: '999px',
            background: 'rgba(11, 28, 51, 0.9)',
            border: '1px solid var(--line2)',
            fontSize: '0.85rem',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {toast}
        </div>
      )}

      {/* Buttons — bottom-left; the player menu owns the bottom-right corner. */}
      <div
        style={{
          position: 'absolute',
          left: 'calc(0.6rem + var(--safe-left, 0px))',
          bottom: 'calc(0.6rem + var(--safe-bottom, 0px))',
          display: 'flex',
          gap: '0.45rem',
        }}
      >
        <RoundButton
          label="👁"
          title="Drži za sliku"
          onPointerDown={() => setPeek(true)}
          onPointerUp={() => setPeek(false)}
        />
        <RoundButton label="⤢" title="Ceo sto" onClick={() => stageRef.current?.fitTable()} />
        <RoundButton label="🔍" title="Ram" onClick={() => stageRef.current?.zoomToFrame()} />
      </div>
      {host.rotation && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(3.9rem + var(--safe-bottom, 0px))',
            left: '0.7rem',
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
            pointerEvents: 'none',
          }}
        >
          Tap na komadić ga okreće
        </div>
      )}

      {peek && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(5, 12, 24, 0.82)',
            padding: '1rem',
            pointerEvents: 'none',
          }}
        >
          <img
            src={host.imageUrl}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '12px', border: '2px solid var(--accent)' }}
          />
        </div>
      )}
    </div>
  );
}

// --- kraj ---------------------------------------------------------------------------

function Finale({ host, playerId, hostless }: { host: PuzlaHostData; playerId: string; hostless: boolean }) {
  const result = host.result;
  const me = host.roster.find((p) => p.playerId === playerId);
  const pct = host.total > 0 ? Math.round((host.lockedCount / host.total) * 100) : 0;
  const sorted = [...host.roster].sort((a, b) => b.score - a.score);
  return (
    <Centered>
      <p style={{ fontSize: '1.7rem', fontWeight: 800, fontFamily: 'var(--font-display)', margin: 0 }}>
        {result?.completed ? 'Složeno! 🎉' : `Isteklo vreme — ${pct}%`}
      </p>
      {result?.completed && (
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
          za {formatClock(result.elapsedSec)}
          {result.finisherId === playerId && ' · poslednji komadić je tvoj ✨'}
        </p>
      )}
      <img
        src={host.imageUrl}
        alt=""
        style={{ maxWidth: '100%', maxHeight: '38vh', borderRadius: '12px', border: '2px solid var(--accent)' }}
      />
      {me && (
        <>
          <p style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--accent)', margin: 0 }}>{me.score}</p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            tvojih poena · 🧷 {me.pairs} spojenih ivica · 🖼️ {me.locks} u ram
          </p>
        </>
      )}
      {hostless ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', width: '100%', maxWidth: '20rem' }}>
          {sorted.map((p, i) => (
            <div
              key={p.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.3rem 0.6rem',
                borderRadius: '0.6rem',
                background: p.playerId === playerId ? 'rgba(194,155,71,0.16)' : 'rgba(11,28,51,0.5)',
                border: '1px solid var(--line)',
                fontSize: '0.9rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>{i + 1}.</span>
              <span>{p.avatarEmoji}</span>
              <span style={{ fontWeight: 700 }}>{p.name}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 800 }}>{p.score}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>Gledaj TV</p>
      )}
    </Centered>
  );
}

// --- bits ----------------------------------------------------------------------------

function useElapsed(elapsedSec: number): number {
  const [now, setNow] = useState(() => Date.now());
  const base = useRef({ sec: elapsedSec, at: Date.now() });
  useEffect(() => {
    base.current = { sec: elapsedSec, at: Date.now() };
  }, [elapsedSec]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return base.current.sec + Math.max(0, Math.floor((now - base.current.at) / 1000));
}

function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
        overflowY: 'auto',
      }}
    >
      {children}
    </div>
  );
}

function Chip({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <span
      style={{
        padding: '0.3rem 0.75rem',
        borderRadius: '999px',
        background: 'rgba(11, 28, 51, 0.82)',
        border: `1px solid ${danger ? 'var(--danger)' : 'var(--line2)'}`,
        color: danger ? 'var(--danger)' : 'var(--text-primary)',
        fontSize: '0.9rem',
        fontWeight: 800,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </span>
  );
}

function RoundButton({
  label,
  title,
  onClick,
  onPointerDown,
  onPointerUp,
}: {
  label: string;
  title: string;
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
}) {
  return (
    <button
      aria-label={title}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{
        width: '2.9rem',
        height: '2.9rem',
        borderRadius: '50%',
        border: '1px solid var(--line2)',
        background: 'rgba(11, 28, 51, 0.85)',
        color: 'var(--text-primary)',
        fontSize: '1.2rem',
        display: 'grid',
        placeItems: 'center',
        padding: 0,
        touchAction: 'none',
      }}
    >
      {label}
    </button>
  );
}
