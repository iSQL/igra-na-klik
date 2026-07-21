import type { Room, GameState, DrawOp, DiplomaCandidate } from '@igra/shared';

export interface IGameModule {
  readonly gameId: string;

  /**
   * Optional hook called by GameManager before onStart, after the platform's
   * generic minPlayers check. Return a string to refuse the start with that
   * message (which is forwarded to the host as a START_ERROR), or null to
   * proceed.
   */
  validateStart?(room: Room, customContent?: unknown): string | null;

  onStart(room: Room, customContent?: unknown): GameState;

  onPlayerAction(
    room: Room,
    gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null;

  /**
   * Optional host-driven action. Routed through `host:game-action` and
   * gated by the same host/remote-host check as `host:start-game`. Use
   * for flow-control the host owns (e.g. advancing a reveal manually
   * instead of on a timer).
   */
  onHostAction?(
    room: Room,
    gameState: GameState,
    action: string,
    data: Record<string, unknown>
  ): GameState | null;

  onTick(room: Room, gameState: GameState, deltaMs: number): GameState | null;

  onPlayerDisconnect(
    room: Room,
    gameState: GameState,
    playerId: string
  ): GameState | null;

  onEnd(room: Room, gameState: GameState): void;

  /**
   * Optional hook called by GameManager at game end (before the module's state
   * is discarded) to contribute game-specific consolation diplomas ("utešne
   * diplome"). Return richer candidates than the generic score-only layer can —
   * e.g. Kviz's "Puž" (slowest) or "Gospodar panike" (most wrong). GameManager
   * merges these with the generic candidates and resolves them via
   * `allocateDiplomas`. Games without an override just get the generic layer.
   */
  getAwardCandidates?(room: Room): DiplomaCandidate[];

  /**
   * Optional hook polled by GameManager after onPlayerAction returns null.
   * Lets a module mutate authoritative game state for a single player and
   * emit a targeted `game:player-state` without broadcasting the new state
   * to the entire room. Used by slepi-telefoni to keep per-player drafts
   * (undo, eraser, fill of a drawing) private during `drawing-step`.
   * Implementations must clear the pending update on read so it fires once.
   */
  getPendingPrivateUpdate?(): {
    playerId: string;
    gameState: GameState;
  } | null;

  /**
   * Optional hook polled by GameManager after onPlayerAction returns null.
   * Lets a module broadcast newly appended drawing ops as a tiny
   * `game:ops-append` event instead of re-emitting the entire game state
   * (whose operations array grows with every 50ms stroke batch — O(n²)
   * traffic over a drawing turn). Full state snapshots remain the
   * authority; clients replace their ops array whenever one arrives.
   * Implementations must clear the pending ops on read so they fire once.
   */
  getPendingOpsAppend?(): DrawOp[] | null;
}
