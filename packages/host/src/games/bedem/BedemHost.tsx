import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { BedemFrame, BedemHostData, BedemMapState } from '@igra/shared';
import { socket } from '../../socket';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { BedemBoard, type BoardTower } from './bedemBoard';

/**
 * Bedem on the TV: the same map(s) the phones play on, only bigger — one
 * board in 'zajedno', a grid of small boards in 'protiv'. Frames go straight
 * from the socket to the canvases, never through the store.
 */
export default function BedemHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const boards = useRef<(BedemBoard | null)[]>([]);
  const livesRef = useRef<(HTMLSpanElement | null)[]>([]);

  const host = gameState?.data.host as BedemHostData | undefined;
  const phase = gameState?.phase;

  useEffect(() => {
    const onFrame = ({ gameId, frame }: { gameId: string; frame: unknown }) => {
      if (gameId !== 'bedem') return;
      const f = frame as BedemFrame;
      f.maps.forEach((m, i) => {
        boards.current[i]?.pushFrame(m);
        // Lives tick on every leak — written straight into the DOM so the
        // whole tree doesn't re-render ten times a second.
        const el = livesRef.current[i];
        if (el) el.textContent = String(m.l);
      });
    };
    socket.on('game:frame', onFrame);
    return () => {
      socket.off('game:frame', onFrame);
    };
  }, []);

  useEffect(() => {
    for (const b of boards.current) b?.clearEnemies();
    if (phase === 'talas') play('reveal');
    if (phase === 'kraj') play(host?.result?.won || host?.mode === 'protiv' ? 'victory' : 'wrong');
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const fallen = host?.maps.filter((m) => !m.alive).length ?? 0;
  const fallenRef = useRef(fallen);
  useEffect(() => {
    if (fallen > fallenRef.current) play('wrong');
    fallenRef.current = fallen;
  }, [fallen, play]);

  const colors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of host?.roster ?? []) map[p.playerId] = p.avatarColor;
    return map;
  }, [host?.roster]);

  if (!gameState || !host) return null;

  const total = host.totalWaves ? ` od ${host.totalWaves}` : '';
  const status =
    phase === 'gradnja'
      ? `Gradnja · talas ${host.wave} za ${gameState.timeRemaining} s · spremno ${host.readyIds.length}/${host.roster.filter((p) => p.alive).length}`
      : `Talas ${host.wave}${total}`;

  const n = host.maps.length;
  const cols = host.mode === 'zajedno' ? 1 : n <= 4 ? n : Math.ceil(n / 2);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        gap: '1.5rem',
        padding: '4.2rem 2rem 1.6rem',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '1.2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '0.4rem 1.2rem',
          borderRadius: 999,
          background: 'rgba(11, 28, 51, 0.72)',
          border: '1px solid var(--line2)',
          fontSize: '1.05rem',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
        }}
      >
        🏰 {status}
        {host.bossNext && phase === 'gradnja' && ' · 🐉 dolazi aždaja!'}
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: '1.2rem',
        }}
      >
        {host.maps.map((map, i) => (
          <MapCard
            key={i}
            map={map}
            host={host}
            colors={colors}
            register={(b) => (boards.current[i] = b)}
            livesRef={(el) => (livesRef.current[i] = el)}
          />
        ))}
      </div>

      {host.mode === 'zajedno' && <TeamPanel host={host} />}

      <AnimatePresence mode="wait">
        {phase === 'uvod' && (
          <Overlay key="uvod">
            <p style={{ fontSize: '5rem', margin: 0 }}>🏰</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '4rem', margin: 0 }}>
              {host.mode === 'zajedno' ? 'Branite bedem!' : 'Svako za svoj bedem!'}
            </h2>
            <p style={{ fontSize: '1.4rem', color: 'var(--text-secondary)', maxWidth: '44rem', textAlign: 'center' }}>
              {host.mode === 'zajedno'
                ? 'Neprijatelji idu stazom ka kapiji. Gradite kule sa telefona — svako svojim zlatom.'
                : 'Svako brani svoju mapu. Tokom talasa šaljite neprijatelje jedni drugima — poslednji koji stoji pobeđuje.'}
            </p>
            <p style={{ fontSize: '1.2rem', color: 'var(--dim)' }}>
              {host.totalWaves ? `${host.totalWaves} talasa` : 'Beskonačno — dok bedem ne padne'}
            </p>
          </Overlay>
        )}
        {(phase === 'kraj' || phase === 'ended') && host.result && (
          <Overlay key="kraj">
            <Results host={host} />
          </Overlay>
        )}
      </AnimatePresence>
    </div>
  );
}

function MapCard({
  map,
  host,
  colors,
  register,
  livesRef,
}: {
  map: BedemMapState;
  host: BedemHostData;
  colors: Record<string, string>;
  register: (b: BedemBoard | null) => void;
  livesRef: (el: HTMLSpanElement | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<BedemBoard | null>(null);
  const owner = map.ownerId ? host.roster.find((p) => p.playerId === map.ownerId) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const board = new BedemBoard(canvas);
    boardRef.current = board;
    register(board);
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      board.resize(rect.width, rect.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => {
      observer.disconnect();
      board.dispose();
      boardRef.current = null;
      register(null);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    boardRef.current?.setLayout(host.cols, host.rows, host.path);
  }, [host.cols, host.rows, host.path]);

  useEffect(() => {
    boardRef.current?.setTowers(map.towers as BoardTower[], colors);
  }, [map.towers, colors]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: '0.5rem' }}>
      {owner && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.3rem 0.8rem 0.3rem 0.3rem',
            borderRadius: 999,
            background: 'rgba(11, 28, 51, 0.62)',
            border: `1px solid ${map.alive ? owner.avatarColor : 'var(--line)'}`,
            opacity: map.alive ? 1 : 0.5,
            alignSelf: 'center',
          }}
        >
          <Avatar color={owner.avatarColor} emoji={map.alive ? owner.avatarEmoji : '💀'} />
          <span style={{ fontSize: '1.15rem', fontWeight: 700 }}>{owner.name}</span>
          <span style={{ fontSize: '1.05rem' }}>
            ❤️ <span ref={livesRef}>{map.lives}</span>
          </span>
          <span style={{ fontSize: '1.05rem', color: 'var(--accent)' }}>💰 {owner.gold}</span>
        </div>
      )}
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          filter: map.alive ? 'none' : 'grayscale(0.85) brightness(0.7)',
          transition: 'filter 600ms ease',
        }}
      >
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
        {!owner && (
          <div
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              padding: '0.3rem 0.9rem',
              borderRadius: 999,
              background: 'rgba(11, 28, 51, 0.8)',
              fontSize: '1.4rem',
              fontWeight: 800,
            }}
          >
            ❤️ <span ref={livesRef}>{map.lives}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 'zajedno': who's building what, and on how much gold. */
function TeamPanel({ host }: { host: BedemHostData }) {
  const towersOf = (id: string) => host.maps[0]?.towers.filter((t) => t.ownerId === id).length ?? 0;
  const ranked = [...host.roster].sort((a, b) => b.score - a.score);
  return (
    <div
      style={{
        width: '22rem',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        justifyContent: 'center',
      }}
    >
      {ranked.map((p) => (
        <div
          key={p.playerId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.7rem',
            padding: '0.5rem 0.9rem 0.5rem 0.5rem',
            borderRadius: 18,
            background: 'rgba(11, 28, 51, 0.62)',
            border: `1px solid ${p.avatarColor}`,
          }}
        >
          <Avatar color={p.avatarColor} emoji={p.avatarEmoji} />
          <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 700 }}>
              {p.name}
              {host.readyIds.includes(p.playerId) && ' ✓'}
            </span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              🏹 {towersOf(p.playerId)} kula · ☠️ {p.kills}
            </span>
          </span>
          <span style={{ fontSize: '1.05rem', color: 'var(--accent)', fontWeight: 700 }}>💰 {p.gold}</span>
        </div>
      ))}
    </div>
  );
}

function Results({ host }: { host: BedemHostData }) {
  const result = host.result!;
  const title =
    host.mode === 'zajedno'
      ? result.won
        ? 'Bedem je odbranjen!'
        : `Bedem je pao posle ${result.wavesSurvived}. talasa`
      : `${result.entries[0]?.name ?? ''} je poslednji stajao!`;
  return (
    <>
      <p style={{ fontSize: '4.5rem', margin: 0 }}>
        {host.mode === 'zajedno' ? (result.won ? '🏰' : '🔥') : '👑'}
      </p>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '3.4rem', margin: 0 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '30rem' }}>
        {result.entries.map((e) => (
          <div
            key={e.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem',
              padding: '0.5rem 1rem 0.5rem 0.5rem',
              borderRadius: 18,
              background: 'rgba(11, 28, 51, 0.7)',
              border: `1px solid ${e.rank === 1 ? 'var(--accent)' : 'var(--line2)'}`,
            }}
          >
            <span style={{ width: '2rem', textAlign: 'center', fontSize: '1.3rem', fontWeight: 800 }}>{e.rank}</span>
            <Avatar color={e.avatarColor} emoji={e.avatarEmoji} />
            <span style={{ flex: 1, fontSize: '1.3rem', fontWeight: 700 }}>{e.name}</span>
            <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>☠️ {e.kills}</span>
            <span style={{ fontSize: '1.3rem', color: 'var(--accent)', fontWeight: 800 }}>{e.score}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Avatar({ color, emoji }: { color: string; emoji: string }) {
  return (
    <span
      style={{
        width: '2.2rem',
        height: '2.2rem',
        borderRadius: '50%',
        background: color,
        display: 'grid',
        placeItems: 'center',
        fontSize: '1.2rem',
        flexShrink: 0,
      }}
    >
      {emoji}
    </span>
  );
}

function Overlay({ children }: { children: ReactNode }) {
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
        gap: '1.1rem',
        background:
          'radial-gradient(900px 560px at 50% 50%, rgba(11, 28, 51, 0.92), rgba(11, 28, 51, 0.7) 62%, rgba(11, 28, 51, 0.35))',
        backdropFilter: 'blur(2px)',
      }}
    >
      {children}
    </motion.div>
  );
}
