import { useT } from '../i18n/useT';
import { usePlayerStore } from '../store/playerStore';
import { useGameStore } from '../store/gameStore';
import { useFlowStore } from '../store/flowStore';

/**
 * "Čekamo: Stefan i Sara" (Tok igre 1c) — for the holder only, once most of
 * the room is done and the phase can be skipped. Null otherwise, including
 * while the holder still owes an answer themselves.
 *
 * Shown in the player menu next to "Nastavi ▸" (and as a badge on the menu
 * button). It used to be a strip pinned to the bottom of the screen, where it
 * covered the game's own "who answered" list.
 */
export function useWaitingOn(): { names: string; timeRemaining: number } | null {
  const t = useT();
  const flow = useFlowStore((s) => s.flow);
  const me = usePlayerStore((s) => s.player);
  const room = usePlayerStore((s) => s.room);
  const timeRemaining = useGameStore((s) => s.gameState?.timeRemaining ?? 0);

  if (!flow || !me || !room || room.remoteHostPlayerId !== me.id) return null;
  const c = flow.collection;
  if (!c?.doneIds || flow.paused || !flow.skipLabel) return null;
  const done = new Set(c.doneIds);
  const notWaiting = new Set(flow.notWaitingIds);
  const pending = c.expectedIds.filter((id) => !done.has(id) && !notWaiting.has(id));
  if (pending.length === 0 || c.doneCount < Math.ceil(c.expectedIds.length / 2)) return null;
  if (pending.includes(me.id)) return null;

  const names = pending
    .map((id) => room.players.find((p) => p.id === id)?.name)
    .filter((n): n is string => !!n);
  const shown =
    names.length <= 2
      ? names.join(` ${t('flow.and')} `)
      : `${names.slice(0, 2).join(', ')} ${t('flow.andMore', { n: names.length - 2 })}`;
  return { names: shown, timeRemaining };
}
