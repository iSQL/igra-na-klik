import { useState } from 'react';
import type { BitkaControllerData, BitkaHostData, BitkaPlayerView } from '@igra/shared';
import { socket } from '../socket';
import { useGameStore } from '../store/gameStore';
import { usePlayerStore } from '../store/playerStore';

/** Faze u kojima aktivni igrač bira teritoriju. */
const PICK_PHASES = ['baza-izbor', 'osvajanje-izbor', 'napad-izbor'];

/**
 * Osvajanje u PlayerMenu popupu — isti pristup kao kviz feedback: renderuje se
 * samo dok ta igra traje, inače vraća null. Nosi dve stvari:
 *
 * - **Spisak teritorija** — rezervni način izbora, za one koji ne žele da
 *   ciljaju prstom po mapi.
 * - **Tabla** — poeni i stanje.
 *
 * Zašto ovde a ne na ekranu igre: mapa je jedino što se tokom partije prati,
 * pa dobija ceo ekran; sve ostalo se otvara iz profila.
 */
export function BitkaBoardMenu({ onPicked }: { onPicked?: () => void }) {
  const gameState = useGameStore((s) => s.gameState);
  const playerId = usePlayerStore((s) => s.player?.id);
  const [open, setOpen] = useState<'lista' | 'tabla' | null>(null);

  if (gameState?.gameId !== 'osvajanje') return null;
  const host = gameState.data?.host as BitkaHostData | undefined;
  if (!host) return null;

  const me = playerId
    ? (gameState.playerData[playerId] as unknown as BitkaControllerData | undefined)
    : undefined;
  const selectable = me?.selectableIds ?? [];
  const picking = PICK_PHASES.includes(gameState.phase) && !!me?.isActive && selectable.length > 0;

  const territoryName = (id: string) =>
    host.map.territories.find((t) => t.id === id)?.name ?? id;

  const sorted: BitkaPlayerView[] = [...host.players].sort((a, b) => b.score - a.score);

  const pick = (id: string) => {
    socket.emit('game:player-action', { action: 'bitka:pick', data: { territoryId: id } });
    setOpen(null);
    onPicked?.();
  };

  return (
    <>
      {picking && (
        <>
          <SectionButton
            icon="🎯"
            label={`Spisak teritorija (${selectable.length})`}
            open={open === 'lista'}
            onClick={() => setOpen((v) => (v === 'lista' ? null : 'lista'))}
          />
          {open === 'lista' && (
            <div style={{ display: 'grid', gap: '0.35rem', maxHeight: '40dvh', overflowY: 'auto' }}>
              {selectable.map((id) => {
                const chosen = me?.myBaseChoice === id;
                return (
                  <button
                    key={id}
                    onClick={() => pick(id)}
                    style={{
                      padding: '0.7rem 0.7rem',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      textAlign: 'left',
                      borderRadius: '10px',
                      border: chosen ? '2px solid var(--accent)' : '1px solid var(--line2)',
                      background: chosen ? 'rgba(194,155,71,0.2)' : 'var(--bg-card)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {territoryName(id)}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <SectionButton
        icon="📊"
        label="Tabla"
        open={open === 'tabla'}
        onClick={() => setOpen((v) => (v === 'tabla' ? null : 'tabla'))}
      />

      {open === 'tabla' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {sorted.map((p) => (
            <div
              key={p.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.6rem',
                borderRadius: '10px',
                background: 'var(--bg-card)',
                borderLeft: `4px solid ${p.avatarColor}`,
                opacity: p.eliminated ? 0.45 : 1,
              }}
            >
              <span>{p.avatarEmoji}</span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: '0.9rem' }}>{p.name}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {p.eliminated ? 'ispao' : `${p.territories} ter. · ${p.walls} zid.`}
              </span>
              <strong style={{ color: 'var(--accent)' }}>{p.score}</strong>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SectionButton({
  icon,
  label,
  open,
  onClick,
}: {
  icon: string;
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.7rem',
        width: '100%',
        padding: '0.7rem 0.8rem',
        borderRadius: '12px',
        background: 'var(--bg-card)',
        border: '1px solid var(--line2)',
        color: 'var(--text-primary)',
        fontWeight: 800,
        fontSize: '0.95rem',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)' }}>{open ? '▴' : '▾'}</span>
    </button>
  );
}
