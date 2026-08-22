import { useState } from 'react';
import { BITKA_ZAMAK_BODOVI, territoryValue } from '@igra/shared';
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

  const byId = new Map(host.players.map((p) => [p.playerId, p]));
  const stateOf = (id: string) => host.board.find((st) => st.id === id);

  // Red u spisku nosi isto što igrač gleda na mapi: ime, čiji je atar, zamak
  // sa zidovima i koliko vredi. U izboru mete neprijateljski zamkovi idu na
  // vrh — to su potezi koji izbacuju iz partije.
  const rows = selectable
    .map((id) => {
      const t = host.map.territories.find((x) => x.id === id);
      const st = stateOf(id);
      const owner = st?.ownerId ? byId.get(st.ownerId) : undefined;
      const castle = !!st?.castle && (st?.walls ?? 0) > 0;
      return {
        id,
        name: t?.name ?? id,
        owner,
        castle,
        walls: st?.walls ?? 0,
        value: castle ? BITKA_ZAMAK_BODOVI : territoryValue(t ?? {}),
      };
    })
    .sort((a, b) => {
      if (gameState.phase === 'napad-izbor' && a.castle !== b.castle) return a.castle ? -1 : 1;
      return 0;
    });

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
              {rows.map((r) => {
                const chosen = me?.myBaseChoice === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => pick(r.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.6rem 0.7rem',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      textAlign: 'left',
                      borderRadius: '10px',
                      border: chosen ? '2px solid var(--accent)' : '1px solid var(--line2)',
                      background: chosen ? 'rgba(194,155,71,0.2)' : 'var(--bg-card)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name}
                    </span>
                    {r.owner ? (
                      <span
                        title={r.owner.name}
                        style={{
                          width: '1.4rem',
                          height: '1.4rem',
                          borderRadius: '50%',
                          background: r.owner.avatarColor,
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '0.75rem',
                          flexShrink: 0,
                        }}
                      >
                        {r.owner.avatarEmoji}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                        ničija
                      </span>
                    )}
                    {r.castle && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                        🏰 {r.walls}
                      </span>
                    )}
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {r.value}
                    </span>
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
          {sorted.map((p) => {
            const onTurn = !!host.activePlayerId && p.playerId === host.activePlayerId;
            const mine = p.playerId === playerId;
            return (
            <div
              key={p.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.6rem',
                borderRadius: '10px',
                background: mine ? 'rgba(194,155,71,0.14)' : 'var(--bg-card)',
                border: mine ? '1px solid var(--accent)' : '1px solid transparent',
                borderLeft: `4px solid ${p.avatarColor}`,
                opacity: p.eliminated ? 0.45 : 1,
              }}
            >
              <span>{p.avatarEmoji}</span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: '0.9rem', minWidth: 0 }}>
                {mine ? 'ti' : p.name}
                {onTurn && (
                  <span
                    style={{
                      marginLeft: '0.4rem',
                      fontSize: '0.6rem',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--accent)',
                      fontWeight: 800,
                    }}
                  >
                    na potezu
                  </span>
                )}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {p.eliminated ? 'ispao' : `${p.territories} ter. · ${p.walls} zid.`}
              </span>
              <strong style={{ color: 'var(--accent)' }}>{p.score}</strong>
            </div>
            );
          })}
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
