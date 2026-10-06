import { useT } from '../../i18n/useT';
import { usePlayerStore } from '../../store/playerStore';
import { useGameStore } from '../../store/gameStore';
import { flowAction, formatClock, useFlowStore } from '../../store/flowStore';
import { useTwoTap } from '../../hooks/useTwoTap';

/**
 * "Čekamo: Stefan i Sara · Nastavi ▸" (Tok igre 1c) — only on the holder's
 * phone, and only once most of the room is done, so the most common reason
 * to open the menu mid-round goes away. Hidden while the holder still owes
 * an answer themselves, so it never covers their own input. "Nastavi ▸"
 * closes the phase (the module's skip) after a second tap.
 */
export function WaitingStrip() {
  const t = useT();
  const flow = useFlowStore((s) => s.flow);
  const me = usePlayerStore((s) => s.player);
  const room = usePlayerStore((s) => s.room);
  const timeRemaining = useGameStore((s) => s.gameState?.timeRemaining ?? 0);
  const { armed, tap } = useTwoTap();

  if (!flow || !me || !room || room.remoteHostPlayerId !== me.id) return null;
  const c = flow.collection;
  if (!c?.doneIds || flow.paused || !flow.skipLabel) return null;
  const done = new Set(c.doneIds);
  const notWaiting = new Set(flow.notWaitingIds);
  const pending = c.expectedIds.filter((id) => !done.has(id) && !notWaiting.has(id));
  const expected = c.expectedIds.length;
  if (pending.length === 0 || c.doneCount < Math.ceil(expected / 2)) return null;
  if (pending.includes(me.id)) return null;

  const names = pending
    .map((id) => room.players.find((p) => p.id === id)?.name)
    .filter((n): n is string => !!n);
  const shown =
    names.length <= 2
      ? names.join(` ${t('flow.and')} `)
      : `${names.slice(0, 2).join(', ')} ${t('flow.andMore', { n: names.length - 2 })}`;

  return (
    <div
      style={{
        position: 'fixed',
        left: 'calc(12px + var(--safe-left))',
        right: 'calc(12px + var(--safe-right))',
        bottom: 'calc(12px + var(--safe-bottom))',
        maxWidth: 496,
        margin: '0 auto',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 10px 10px 14px',
        borderRadius: 18,
        background: 'var(--bg-secondary)',
        border: '1px solid rgba(194,155,71,.5)',
        boxShadow: '0 12px 30px rgba(0,0,0,.4)',
        animation: 'igra-slide-up .26s cubic-bezier(.22,1,.36,1)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span
          style={{
            fontWeight: 800,
            fontSize: '0.88rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {t('flow.waitingFor', { names: shown })}
        </span>
        {timeRemaining > 0 && (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            {t('flow.timeLeft', { time: formatClock(timeRemaining) })}
          </span>
        )}
      </span>
      <button
        onClick={() => tap('go', () => flowAction('skip'))}
        style={{
          height: 48,
          padding: '0 14px',
          borderRadius: 14,
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
          border: 'none',
          fontWeight: 800,
          fontSize: '0.88rem',
          flexShrink: 0,
        }}
      >
        {armed === 'go' ? t('flow.sure') : t('flow.continue')}
      </button>
    </div>
  );
}
