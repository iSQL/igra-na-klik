import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PuzlaFrame, PuzlaHostData } from '@igra/shared';
import { socket } from '../../socket';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import {
  PUZLA_FLASH_MS,
  PuzlaTable,
  buildPuzlaSprites,
  drawPuzlaTable,
  fitPuzlaView,
  loadPuzlaImage,
  type PuzlaFlash,
  type PuzlaSprites,
} from './puzlaTable';

/**
 * Puzla on the TV — a mirror of the table everyone is working on from their
 * phones. The canvas is fed by `game:frame` directly (never through the
 * store, which would re-render React ~15×/s while anyone drags) and by full
 * states for drops, joins and phases.
 */
export default function PuzlaHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const host = gameState?.data.host as PuzlaHostData | undefined;
  const phase = gameState?.phase;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableRef = useRef(new PuzlaTable());
  const spritesRef = useRef<PuzlaSprites | null>(null);
  const colorsRef = useRef<Record<string, string>>({});
  const namesRef = useRef<Record<string, string>>({});
  const flashesRef = useRef<PuzlaFlash[]>([]);
  const eventSeqRef = useRef<number | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  // --- image + sprites ---------------------------------------------------------
  useEffect(() => {
    if (!host?.imageUrl) return;
    let cancelled = false;
    loadPuzlaImage(host.imageUrl)
      .then((img) => {
        if (!cancelled) setImage(img);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [host?.imageUrl]);

  const seed = host?.geo.seed;
  useEffect(() => {
    const geo = tableRef.current.geo;
    if (!image || !geo) return;
    spritesRef.current = buildPuzlaSprites(geo, image, 4096);
    tableRef.current.version++;
  }, [image, seed]);

  // --- state → table -------------------------------------------------------------
  useEffect(() => {
    if (!host) return;
    const table = tableRef.current;
    const firstGeo = !table.geo;
    table.applyState(host);
    if (firstGeo && image) {
      spritesRef.current = buildPuzlaSprites(host.geo, image, 4096);
    }

    const colors: Record<string, string> = {};
    const names: Record<string, string> = {};
    for (const p of host.roster) {
      colors[p.playerId] = p.avatarColor;
      names[p.playerId] = p.name;
    }
    colorsRef.current = colors;
    namesRef.current = names;

    const ev = host.lastEvent;
    // Seeded from what's there at mount, so a remount doesn't replay the last join.
    if (eventSeqRef.current === null) {
      eventSeqRef.current = ev?.seq ?? 0;
    } else if (ev && ev.seq > eventSeqRef.current) {
      eventSeqRef.current = ev.seq;
      flashesRef.current.push({
        x: ev.x,
        y: ev.y,
        kind: ev.kind,
        color: colors[ev.playerId] ?? '#F2CE74',
        startedAt: performance.now(),
      });
    }
  }, [host, image]);

  // --- frames ----------------------------------------------------------------------
  useEffect(() => {
    const onFrame = ({ gameId, frame }: { gameId: string; frame: unknown }) => {
      if (gameId !== 'puzla') return;
      tableRef.current.applyFrame(frame as PuzlaFrame);
    };
    socket.on('game:frame', onFrame);
    return () => {
      socket.off('game:frame', onFrame);
    };
  }, []);

  // --- canvas loop -------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let dirty = true;
    let lastVersion = -1;
    let last = performance.now();
    let raf = 0;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect?.width ?? window.innerWidth;
      h = rect?.height ?? window.innerHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      dirty = true;
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const table = tableRef.current;
      const dt = Math.min(100, now - last);
      last = now;
      const moving = table.step(dt);
      const flashes = flashesRef.current.filter((f) => now - f.startedAt < PUZLA_FLASH_MS);
      flashesRef.current = flashes;
      if (!dirty && !moving && table.version === lastVersion && flashes.length === 0) return;
      dirty = false;
      lastVersion = table.version;
      if (!table.geo || w === 0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawPuzlaTable(ctx, table, spritesRef.current, fitPuzlaView(table.geo, w, h, 18), {
        colors: colorsRef.current,
        names: namesRef.current,
        flashes,
        now,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (phase === 'kraj') play(host?.result?.completed ? 'victory' : 'reveal');
    // Only on the phase flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const elapsed = useElapsed(host, phase);

  if (!gameState || !host) return null;

  const progress = host.total > 0 ? host.lockedCount / host.total : 0;
  const clock =
    host.timeLimitSec !== null
      ? formatClock(phase === 'slaganje' ? gameState.timeRemaining : Math.max(0, host.timeLimitSec - elapsed))
      : formatClock(elapsed);
  const lowTime = host.timeLimitSec !== null && phase === 'slaganje' && gameState.timeRemaining <= 30;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.4rem',
          padding: '0.9rem 7rem 0.6rem 1.6rem',
        }}
      >
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 800 }}>
          🖼️ Puzla
        </span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <div
            style={{
              height: '0.7rem',
              borderRadius: '999px',
              background: 'rgba(245,235,224,0.1)',
              overflow: 'hidden',
            }}
          >
            <motion.div
              animate={{ width: `${progress * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              style={{ height: '100%', background: 'var(--accent)', borderRadius: '999px' }}
            />
          </div>
          <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
            {host.lockedCount} / {host.total} komadića u ramu
            {host.rotation && ' · okrenuti komadići'}
          </span>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.4rem',
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            color: lowTime ? 'var(--danger)' : 'var(--text-primary)',
          }}
        >
          {host.timeLimitSec === null ? '⏱ ' : '⏳ '}
          {clock}
        </span>
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
        {phase === 'slaganje' && <SideRoster host={host} />}
      </div>

      <AnimatePresence mode="wait">
        {phase === 'pregled' && (
          <Overlay key="pregled">
            <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', letterSpacing: '0.12em', margin: 0 }}>
              {host.total} KOMADIĆA · {host.timeLimitSec === null ? 'OPUŠTENO' : `ROK ${formatClock(host.timeLimitSec)}`}
            </p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '3.4rem', margin: 0 }}>
              Dobro pogledajte sliku!
            </h2>
            <img
              src={host.imageUrl}
              alt=""
              style={{
                maxWidth: '70vw',
                maxHeight: '58vh',
                borderRadius: '14px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
                border: '3px solid var(--accent)',
              }}
            />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '3.6rem', fontWeight: 800, color: 'var(--accent)' }}>
              {Math.max(1, gameState.timeRemaining)}
            </div>
          </Overlay>
        )}
        {(phase === 'kraj' || phase === 'ended') && host.result && (
          <Overlay key="kraj">
            <Finale host={host} />
          </Overlay>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- pieces -----------------------------------------------------------------------

function useElapsed(host: PuzlaHostData | undefined, phase: string | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  const base = useRef({ sec: 0, at: Date.now() });
  const sec = host?.elapsedSec ?? 0;
  useEffect(() => {
    base.current = { sec, at: Date.now() };
  }, [sec]);
  useEffect(() => {
    if (phase !== 'slaganje') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);
  if (phase !== 'slaganje') return host?.result?.elapsedSec ?? sec;
  return base.current.sec + Math.max(0, Math.floor((now - base.current.at) / 1000));
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function SideRoster({ host }: { host: PuzlaHostData }) {
  const sorted = [...host.roster].sort((a, b) => b.score - a.score);
  return (
    <div
      style={{
        position: 'absolute',
        left: '1.2rem',
        top: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        pointerEvents: 'none',
      }}
    >
      {sorted.map((p) => {
        const holding = Object.values(host.holders).includes(p.playerId);
        return (
          <div
            key={p.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.55rem',
              padding: '0.25rem 0.8rem 0.25rem 0.25rem',
              borderRadius: '999px',
              background: 'rgba(11, 28, 51, 0.72)',
              border: `1px solid ${holding ? p.avatarColor : 'var(--line)'}`,
            }}
          >
            <span
              style={{
                width: '1.9rem',
                height: '1.9rem',
                borderRadius: '50%',
                background: p.avatarColor,
                display: 'grid',
                placeItems: 'center',
                fontSize: '1.05rem',
              }}
            >
              {p.avatarEmoji}
            </span>
            <span style={{ fontSize: '1rem', fontWeight: 700 }}>{p.name}</span>
            <span style={{ fontSize: '0.95rem', color: 'var(--accent)', marginLeft: 'auto', paddingLeft: '0.5rem' }}>
              {p.score}
            </span>
          </div>
        );
      })}
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
        gap: '1rem',
        background:
          'radial-gradient(1000px 640px at 50% 50%, rgba(11, 28, 51, 0.94), rgba(11, 28, 51, 0.78) 62%, rgba(11, 28, 51, 0.5))',
      }}
    >
      {children}
    </motion.div>
  );
}

function Finale({ host }: { host: PuzlaHostData }) {
  const result = host.result!;
  const pct = host.total > 0 ? Math.round((host.lockedCount / host.total) * 100) : 0;
  const finisher = host.roster.find((p) => p.playerId === result.finisherId);
  const sorted = [...host.roster].sort((a, b) => b.score - a.score);
  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '3.2rem', margin: 0 }}>
        {result.completed ? 'Slika je složena! 🎉' : `Isteklo vreme — složeno ${pct}%`}
      </h2>
      <p style={{ fontSize: '1.3rem', color: 'var(--text-secondary)', margin: 0 }}>
        {result.completed
          ? `za ${formatClock(result.elapsedSec)}${finisher ? ` · poslednji komadić: ${finisher.name}` : ''}${
              result.bonus > 0 ? ` · svima +${result.bonus}` : ''
            }`
          : `${host.lockedCount} od ${host.total} komadića je u ramu`}
      </p>
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', maxWidth: '92vw' }}>
        <img
          src={host.imageUrl}
          alt=""
          style={{
            maxWidth: '46vw',
            maxHeight: '56vh',
            borderRadius: '14px',
            border: '3px solid var(--accent)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
            filter: result.completed ? 'none' : 'grayscale(0.4)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', minWidth: '22rem' }}>
          {sorted.map((p, i) => (
            <div
              key={p.playerId}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto auto 1fr auto auto',
                alignItems: 'center',
                gap: '0.7rem',
                padding: '0.45rem 0.9rem',
                borderRadius: '0.8rem',
                background: i === 0 ? 'rgba(194, 155, 71, 0.16)' : 'rgba(11, 28, 51, 0.55)',
                border: `1px solid ${i === 0 ? 'var(--accent)' : 'var(--line)'}`,
              }}
            >
              <span style={{ color: 'var(--text-secondary)', width: '1.5rem' }}>{i + 1}.</span>
              <span
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '50%',
                  background: p.avatarColor,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {p.avatarEmoji}
              </span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{p.name}</span>
              <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                🧷 {p.pairs} · 🖼️ {p.locks}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.4rem',
                  color: 'var(--accent)',
                  minWidth: '3.5rem',
                  textAlign: 'right',
                }}
              >
                {p.score}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
