import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  BedemControllerData,
  BedemFrame,
  BedemFrameIncoming,
  BedemHostData,
  BedemSendType,
  BedemTowerType,
} from '@igra/shared';
import {
  BEDEM_ENEMIES,
  BEDEM_SEND_ORDER,
  BEDEM_SENDS,
  BEDEM_TOWER_ORDER,
  BEDEM_TOWERS,
  bedemBuildable,
  bedemPathCells,
  bedemSellValue,
  bedemUpgradeCost,
} from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { cue } from '../../utils/cues';
import { GameFrame } from '../../components/kit/GameFrame';
import { HostlessLeaderboard } from '../../components/HostlessLeaderboard';
import { BedemBoard, type BoardTower } from './bedemBoard';

/**
 * Bedem on the phone: the whole map, always — this is where the game is
 * played, with or without a TV. The board is a canvas fed straight from
 * `game:frame` (never through the store); React only holds what changes a few
 * times a second at most: gold, lives, the open sheet.
 */
export default function BedemController() {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  if (!gameState || !playerId) return null;

  const { phase, data, playerData } = gameState;
  const host = data.host as BedemHostData;
  const my = playerData[playerId] as unknown as BedemControllerData | undefined;
  const subtitle = waveLabel(host);

  if (phase === 'uvod') {
    return (
      <GameFrame gameId="bedem" subtitle={subtitle} timeRemaining={gameState.timeRemaining}>
        <Intro host={host} />
      </GameFrame>
    );
  }

  if (phase === 'kraj' || phase === 'ended') {
    return (
      <GameFrame gameId="bedem" subtitle="Kraj igre">
        <Results host={host} playerId={playerId} />
      </GameFrame>
    );
  }

  return (
    <GameFrame
      gameId="bedem"
      subtitle={subtitle}
      timeRemaining={phase === 'gradnja' ? gameState.timeRemaining : undefined}
      roundKey={phase === 'talas' ? host.wave : undefined}
    >
      <Play host={host} phase={phase} playerId={playerId} my={my} />
    </GameFrame>
  );
}

function waveLabel(host: BedemHostData): string {
  const total = host.totalWaves ? `/${host.totalWaves}` : '';
  const mode = host.mode === 'zajedno' ? 'Zajedno' : 'Protiv';
  return `Talas ${host.wave}${total} · ${mode}${host.bossNext ? ' · 🐉 aždaja' : ''}`;
}

// --- Intro -----------------------------------------------------------------

function Intro({ host }: { host: BedemHostData }) {
  return (
    <Centered>
      <p style={{ fontSize: '3.2rem', margin: 0 }}>🏰</p>
      <p className="display" style={{ fontSize: '1.7rem', fontWeight: 700, margin: 0 }}>
        {host.mode === 'zajedno' ? 'Branite bedem zajedno!' : 'Svako brani svoj bedem!'}
      </p>
      <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', maxWidth: '19rem', margin: 0 }}>
        {host.mode === 'zajedno'
          ? 'Jedna mapa, jedna kapija, 20 života. Svako ima svoje zlato — tapni polje pored staze i sagradi kulu.'
          : 'Tvoja mapa, tvojih 20 života. Tokom talasa šalji neprijatelje drugima — svako slanje ti povećava platu.'}
      </p>
      <p style={{ fontSize: '0.85rem', color: 'var(--dim)', margin: 0 }}>
        {host.totalWaves ? `${host.totalWaves} talasa` : 'Beskonačno — dok bedem ne padne'}
      </p>
    </Centered>
  );
}

// --- Play ------------------------------------------------------------------

type Sheet =
  | { kind: 'build'; c: number; r: number }
  | { kind: 'tower'; id: number }
  | { kind: 'send' }
  | null;

function Play({
  host,
  phase,
  playerId,
  my,
}: {
  host: BedemHostData;
  phase: string;
  playerId: string;
  my?: BedemControllerData;
}) {
  const playing = !!my;
  const myIndex = my?.mapIndex ?? 0;
  const myMap = host.maps[myIndex];
  const myAlive = playing && !!myMap?.alive;
  // A fallen 'protiv' player (or a late guest) watches; they can flip maps.
  const [watchIndex, setWatchIndex] = useState(myIndex);
  const viewIndex = myAlive ? myIndex : watchIndex;
  const viewMap = host.maps[viewIndex];

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<BedemBoard | null>(null);
  const viewRef = useRef(viewIndex);
  viewRef.current = viewIndex;

  const [gold, setGold] = useState(my?.gold ?? 0);
  const [lives, setLives] = useState<number[]>(host.maps.map((m) => m.lives));
  const [incoming, setIncoming] = useState<BedemFrameIncoming[]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<string | null>(null);
  const pendingSelect = useRef<{ c: number; r: number } | null>(null);
  const lastLeakCue = useRef(0);
  const knownSenders = useRef('');

  const pathCells = useMemo(() => bedemPathCells(host.path), [host.path]);
  const colors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of host.roster) map[p.playerId] = p.avatarColor;
    return map;
  }, [host.roster]);
  const nameOf = (id: string) => host.roster.find((p) => p.playerId === id)?.name ?? '?';

  // Full state is the authority for gold whenever it arrives; frames update it
  // in between (every kill pays). Whichever arrived last wins.
  useEffect(() => {
    if (my) setGold(my.gold);
  }, [my?.gold]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLives(host.maps.map((m) => m.lives));
  }, [host.maps]);

  // --- Board lifecycle -----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const board = new BedemBoard(canvas);
    boardRef.current = board;
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
    };
  }, []);

  useEffect(() => {
    boardRef.current?.setLayout(host.cols, host.rows, host.path);
  }, [host.cols, host.rows, host.path]);

  useEffect(() => {
    boardRef.current?.setTowers((viewMap?.towers ?? []) as BoardTower[], colors);
    boardRef.current?.setHighlightOwner(playerId);
    // The tower we just ordered has arrived — open it, so the range shows.
    const want = pendingSelect.current;
    if (want) {
      const t = viewMap?.towers.find((x) => x.c === want.c && x.r === want.r && x.ownerId === playerId);
      if (t) {
        pendingSelect.current = null;
        setSheet({ kind: 'tower', id: t.id });
      }
    }
  }, [viewMap?.towers, colors, playerId]);

  // A wave is over (or about to start): nothing should stand frozen on the path.
  useEffect(() => {
    boardRef.current?.clearEnemies();
    setIncoming([]);
    if (phase !== 'talas') setSheet((s) => (s?.kind === 'send' ? null : s));
  }, [phase]);

  useEffect(() => {
    boardRef.current?.clearEnemies();
  }, [viewIndex]);

  // --- Frames --------------------------------------------------------------
  useEffect(() => {
    const onFrame = ({ gameId, frame }: { gameId: string; frame: unknown }) => {
      if (gameId !== 'bedem') return;
      const f = frame as BedemFrame;
      const map = f.maps[viewRef.current];
      if (map) boardRef.current?.pushFrame(map);
      const g = f.g[playerId];
      if (g !== undefined) setGold(g);
      setLives((prev) => {
        const next = f.maps.map((m) => m.l);
        return next.length === prev.length && next.every((l, i) => l === prev[i]) ? prev : next;
      });
      const mine = f.maps[myIndex];
      if (mine) {
        if (mine.x > 0 && performance.now() - lastLeakCue.current > 1200) {
          lastLeakCue.current = performance.now();
          cue('wrong');
        }
        const inc = mine.p ?? [];
        const key = [...new Set(inc.map((i) => i.f))].sort().join(',');
        if (key && key !== knownSenders.current) cue('knock');
        knownSenders.current = key;
        setIncoming((prev) => (prev.length === 0 && inc.length === 0 ? prev : inc));
      }
    };
    socket.on('game:frame', onFrame);
    return () => {
      socket.off('game:frame', onFrame);
    };
  }, [playerId, myIndex]);

  // --- Selection on the board ----------------------------------------------
  const selectedTower =
    sheet?.kind === 'tower' ? viewMap?.towers.find((t) => t.id === sheet.id) : undefined;
  useEffect(() => {
    if (sheet?.kind === 'build') {
      boardRef.current?.setSelection({ c: sheet.c, r: sheet.r, color: '#C29B47' });
    } else if (selectedTower) {
      const lvl = BEDEM_TOWERS[selectedTower.type].levels[selectedTower.level - 1];
      boardRef.current?.setSelection({
        c: selectedTower.c,
        r: selectedTower.r,
        range: lvl.range,
        color: colors[selectedTower.ownerId],
      });
    } else {
      boardRef.current?.setSelection(null);
    }
  }, [sheet, selectedTower, colors]);
  // A sold tower closes its own sheet.
  useEffect(() => {
    if (sheet?.kind === 'tower' && !selectedTower) setSheet(null);
  }, [sheet, selectedTower]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const down = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const from = down.current;
    down.current = null;
    if (!from || Math.hypot(e.clientX - from.x, e.clientY - from.y) > 14) return;
    const cell = boardRef.current?.cellAt(e.clientX, e.clientY);
    if (!cell) {
      setSheet(null);
      return;
    }
    const tower = viewMap?.towers.find((t) => t.c === cell.c && t.r === cell.r);
    if (tower) {
      if (tower.ownerId === playerId || !myAlive) {
        setSheet({ kind: 'tower', id: tower.id });
      } else {
        setSheet(null);
        setToast(`${BEDEM_TOWERS[tower.type].emoji} Kula igrača ${nameOf(tower.ownerId)}`);
      }
      return;
    }
    if (!myAlive || !bedemBuildable(host, pathCells, cell.c, cell.r)) {
      setSheet(null);
      return;
    }
    setSheet({ kind: 'build', c: cell.c, r: cell.r });
  };

  // --- Actions -------------------------------------------------------------
  const act = (action: string, data: Record<string, unknown> = {}) => {
    socket.emit('game:player-action', { action, data });
  };
  const build = (type: BedemTowerType) => {
    if (sheet?.kind !== 'build') return;
    pendingSelect.current = { c: sheet.c, r: sheet.r };
    act('bedem:build', { c: sheet.c, r: sheet.r, tower: type });
    cue('sent');
    setSheet(null);
  };

  const ready = host.readyIds.includes(playerId);
  const expected = host.roster.filter((p) => p.alive).length;
  const opponents = host.roster.filter((p) => p.playerId !== playerId && p.alive);
  const target = opponents.find((p) => p.playerId === sendTarget) ?? null;
  const myLives = lives[myIndex] ?? myMap?.lives ?? 0;

  const incomingSummary = useMemo(() => {
    const groups = new Map<string, { from: string; u: BedemSendType; n: number }>();
    for (const i of incoming) {
      const key = `${i.f}:${i.u}`;
      const g = groups.get(key) ?? { from: i.f, u: i.u, n: 0 };
      g.n += 1;
      groups.set(key, g);
    }
    return [...groups.values()];
  }, [incoming]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, paddingTop: 8 }}>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Chip>❤️ {host.mode === 'zajedno' ? lives[0] ?? 0 : myLives}</Chip>
        {playing && <Chip strong>💰 {gold}</Chip>}
        {host.mode === 'protiv' &&
          host.roster
            .filter((p) => p.playerId !== playerId)
            .map((p) => {
              const idx = host.maps.findIndex((m) => m.ownerId === p.playerId);
              const watching = !myAlive && idx === viewIndex;
              return (
                <button
                  key={p.playerId}
                  onClick={() => !myAlive && idx >= 0 && setWatchIndex(idx)}
                  style={{
                    border: watching ? `2px solid ${p.avatarColor}` : '1px solid var(--line)',
                    background: 'var(--bg-secondary)',
                    borderRadius: 999,
                    padding: '3px 9px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: p.alive ? 'var(--text-primary)' : 'var(--dim)',
                    opacity: p.alive ? 1 : 0.6,
                  }}
                >
                  <span style={{ color: p.avatarColor }}>●</span> {p.name} {p.alive ? `❤️${lives[idx] ?? 0}` : '💀'}
                </button>
              );
            })}
      </div>

      {/* Board */}
      <div
        ref={wrapRef}
        className="game-area"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        style={{ position: 'relative', flex: 1, minHeight: 0, touchAction: 'manipulation' }}
      >
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />

        {incomingSummary.length > 0 && myAlive && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '5px 12px',
              borderRadius: 999,
              background: 'rgba(224,106,94,0.92)',
              color: '#fff',
              fontSize: '0.82rem',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            ⚠️ {incomingSummary
              .map((g) => `${nameOf(g.from)}: ${BEDEM_ENEMIES[BEDEM_SENDS[g.u].enemy].emoji}×${g.n}`)
              .join(' · ')}
          </div>
        )}

        {toast && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '5px 12px',
              borderRadius: 999,
              background: 'rgba(11,28,51,0.9)',
              border: '1px solid var(--line2)',
              fontSize: '0.82rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {toast}
          </div>
        )}

        {playing && !myAlive && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '6px 14px',
              borderRadius: 12,
              background: 'rgba(11,28,51,0.9)',
              fontSize: '0.85rem',
              fontWeight: 700,
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            💀 Tvoj bedem je pao — gledaš {nameOf(viewMap?.ownerId ?? '')}
          </div>
        )}
        {!playing && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '6px 14px',
              borderRadius: 12,
              background: 'rgba(11,28,51,0.9)',
              fontSize: '0.85rem',
              fontWeight: 700,
              pointerEvents: 'none',
            }}
          >
            👀 Partija je počela bez tebe — u sledećoj si
          </div>
        )}
      </div>

      {/* Bottom: the open sheet, or the phase action */}
      {sheet?.kind === 'build' && (
        <SheetBox onClose={() => setSheet(null)} title="Sagradi kulu">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {BEDEM_TOWER_ORDER.map((type) => {
              const def = BEDEM_TOWERS[type];
              const cost = def.levels[0].cost;
              const can = gold >= cost;
              return (
                <button
                  key={type}
                  disabled={!can}
                  onClick={() => build(type)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    textAlign: 'left',
                    minHeight: 56,
                    padding: '6px 10px',
                    borderRadius: 14,
                    border: `1.5px solid ${can ? def.color : 'var(--line)'}`,
                    background: 'var(--bg-secondary)',
                    color: can ? 'var(--text-primary)' : 'var(--dim)',
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>{def.emoji}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>
                      {def.name} · 💰{cost}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: 1.2 }}>
                      {def.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </SheetBox>
      )}

      {sheet?.kind === 'tower' && selectedTower && (
        <TowerSheet
          tower={selectedTower}
          gold={gold}
          own={selectedTower.ownerId === playerId && myAlive}
          ownerName={nameOf(selectedTower.ownerId)}
          onUpgrade={() => {
            act('bedem:upgrade', { towerId: selectedTower.id });
            cue('sent');
          }}
          onSell={() => {
            act('bedem:sell', { towerId: selectedTower.id });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.kind === 'send' && myAlive && (
        <SheetBox onClose={() => setSheet(null)} title={`Pošalji ${target ? target.name : 'sledećem'}`}>
          {opponents.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <SmallPill active={!target} onClick={() => setSendTarget(null)}>
                ➡️ Sledećem
              </SmallPill>
              {opponents.map((p) => (
                <SmallPill
                  key={p.playerId}
                  active={target?.playerId === p.playerId}
                  onClick={() => setSendTarget(p.playerId)}
                >
                  <span style={{ color: p.avatarColor }}>●</span> {p.name}
                </SmallPill>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {BEDEM_SEND_ORDER.map((u) => {
              const def = BEDEM_SENDS[u];
              const can = gold >= def.cost;
              return (
                <button
                  key={u}
                  disabled={!can}
                  onClick={() => {
                    act('bedem:send', { unit: u, targetId: target?.playerId });
                    cue('sent');
                  }}
                  style={{
                    minHeight: 64,
                    borderRadius: 14,
                    border: `1.5px solid ${can ? 'var(--danger)' : 'var(--line)'}`,
                    background: 'var(--bg-secondary)',
                    color: can ? 'var(--text-primary)' : 'var(--dim)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    padding: 4,
                  }}
                >
                  <span style={{ fontSize: '1.3rem' }}>
                    {BEDEM_ENEMIES[def.enemy].emoji}×{def.count}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>💰{def.cost}</span>
                  <span style={{ fontSize: '0.66rem', color: 'var(--success-ink)' }}>+{def.income} plata</span>
                </button>
              );
            })}
          </div>
        </SheetBox>
      )}

      {!sheet && phase === 'gradnja' && myAlive && (
        <button
          className={ready ? 'btn-ghost' : 'btn-primary'}
          disabled={ready}
          onClick={() => {
            act('bedem:ready');
            cue('sent');
          }}
          style={{ width: '100%', flexShrink: 0 }}
        >
          {ready
            ? `Spreman ✓ · čekamo ostale (${host.readyIds.length}/${expected})`
            : `Spreman — pusti talas ${host.wave}${host.bossNext ? ' 🐉' : ''}`}
        </button>
      )}

      {!sheet && phase === 'talas' && myAlive && host.mode === 'protiv' && opponents.length > 0 && (
        <button
          className="btn-primary"
          onClick={() => setSheet({ kind: 'send' })}
          style={{ width: '100%', flexShrink: 0, background: 'var(--danger)', color: '#fff' }}
        >
          🐺 Pošalji neprijatelje
        </button>
      )}

      {!sheet && phase === 'talas' && myAlive && host.mode === 'zajedno' && (
        <p style={{ margin: 0, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
          Kule same pucaju — tapni polje da dograđuješ.
        </p>
      )}
    </div>
  );
}

function TowerSheet({
  tower,
  gold,
  own,
  ownerName,
  onUpgrade,
  onSell,
  onClose,
}: {
  tower: { type: BedemTowerType; level: number; spent: number };
  gold: number;
  own: boolean;
  ownerName: string;
  onUpgrade: () => void;
  onSell: () => void;
  onClose: () => void;
}) {
  const def = BEDEM_TOWERS[tower.type];
  const lvl = def.levels[tower.level - 1];
  const next = def.levels[tower.level];
  const upCost = bedemUpgradeCost(tower.type, tower.level);
  const stat = (l: typeof lvl) =>
    l.chain
      ? `${l.damage} štete · ${l.chain} mete`
      : l.slow
        ? `−${Math.round(l.slow * 100)}% brzine`
        : `${l.damage} štete${l.splash ? ' u krugu' : ''}`;
  return (
    <SheetBox onClose={onClose} title={`${def.emoji} ${def.name} · nivo ${tower.level}`}>
      <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {stat(lvl)} · domet {lvl.range}
        {next && ` → ${stat(next)} · domet ${next.range}`}
        {!own && ` · kula igrača ${ownerName}`}
      </p>
      {own && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-primary"
            disabled={upCost === null || gold < upCost}
            onClick={onUpgrade}
            style={{ flex: 2, minHeight: 50 }}
          >
            {upCost === null ? 'Najviši nivo' : `⬆️ Nadogradi · 💰${upCost}`}
          </button>
          <button className="btn-ghost" onClick={onSell} style={{ flex: 1, minHeight: 50 }}>
            Prodaj +{bedemSellValue(tower.spent)}
          </button>
        </div>
      )}
    </SheetBox>
  );
}

// --- Results -----------------------------------------------------------------

function Results({ host, playerId }: { host: BedemHostData; playerId: string }) {
  const result = host.result;
  if (!result) return null;
  const winner = result.entries[0];
  const title =
    host.mode === 'zajedno'
      ? result.won
        ? 'Bedem je odbranjen!'
        : `Bedem je pao posle ${result.wavesSurvived}. talasa`
      : winner
        ? `${winner.name} je poslednji stajao!`
        : 'Kraj';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12, paddingTop: 12, overflowY: 'auto' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '2.6rem', margin: 0 }}>
          {host.mode === 'zajedno' ? (result.won ? '🏰' : '🔥') : '👑'}
        </p>
        <p className="display" style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          {title}
        </p>
        {host.mode === 'zajedno' && !host.totalWaves && (
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Izdržali ste {result.wavesSurvived} talasa
          </p>
        )}
      </div>
      <HostlessLeaderboard
        title="Rang lista"
        embedded
        myPlayerId={playerId}
        entries={result.entries.map((e) => ({
          playerId: e.playerId,
          name: e.name,
          avatarColor: e.avatarColor,
          score: e.score,
          rank: e.rank,
        }))}
      />
    </div>
  );
}

// --- Small pieces --------------------------------------------------------------

function SheetBox({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="card tg-rise"
      style={{ padding: '10px 12px 12px', flexShrink: 0, boxShadow: '0 -8px 24px rgba(0,0,0,0.25)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span className="display" style={{ flex: 1, fontWeight: 700, fontSize: '1.02rem' }}>
          {title}
        </span>
        <button
          onClick={onClose}
          aria-label="Zatvori"
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: '1px solid var(--line2)',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: '1rem',
          }}
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}

function Chip({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        background: strong ? 'rgba(194,155,71,0.18)' : 'var(--bg-secondary)',
        border: `1px solid ${strong ? 'rgba(194,155,71,0.5)' : 'var(--line)'}`,
        fontWeight: 800,
        fontSize: '0.92rem',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </span>
  );
}

function SmallPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        border: active ? '1.5px solid var(--accent)' : '1px solid var(--line2)',
        background: active ? 'rgba(194,155,71,0.18)' : 'transparent',
        color: 'var(--text-primary)',
        fontSize: '0.78rem',
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '0.9rem',
        gap: '0.7rem',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}
