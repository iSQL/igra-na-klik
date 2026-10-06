import type {
  Room,
  GameState,
  DrawOp,
  DiplomaCandidate,
  GameFlowCollection,
} from '@igra/shared';

export interface IGameModule {
  readonly gameId: string;

  /**
   * Simulation interval for this module, ms. Defaults to the platform's 1s
   * tick, which is all a turn-based game needs. Continuous-input games (Splav)
   * set ~33ms and take over their own broadcasting via `getPendingFrame` —
   * returning a full GameState 30×/s would re-send the roster and every
   * per-player slice on every frame.
   *
   * `onTick` receives the real interval as `deltaMs`, so a module never has to
   * assume one second.
   */
  readonly tickIntervalMs?: number;

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

  /**
   * Optional hook polled by GameManager after every tick. Lets a fast-tick
   * module publish a compact positional snapshot as a tiny `game:frame`
   * broadcast instead of a full state update — the same delta trick as
   * `getPendingOpsAppend`, applied to a simulation instead of a drawing.
   *
   * Frames carry only public data (the whole room sees the arena anyway), so
   * they are broadcast unfiltered. Full state snapshots remain the authority
   * for phases, scores and rosters. Implementations must clear the pending
   * frame on read so it fires once.
   */
  getPendingFrame?(): unknown | null;

  // --- Platform flow (pause / skip / "ne čekaj ga"), all optional ---------
  // A module without these still pauses and stops like any other game; the
  // host's skip button and the "who are we waiting for" UI just don't show.

  /**
   * Polled by GameManager after every emitted state. `collection` lists who
   * the current input phase is waiting on (ids only — never answers; leave
   * out `doneIds` where who-already-acted leaks something). `skipLabel` names
   * what the host's skip button does in this phase, or null if it can't.
   */
  getFlowInfo?(
    room: Room,
    gameState: GameState
  ): { collection: GameFlowCollection | null; skipLabel: string | null };

  /** The host skipped: close the current phase exactly as if its clock ran out. */
  onHostSkip?(room: Room, gameState: GameState): GameState | null;

  /**
   * The host stopped waiting for this player: drop them from the current
   * phase's expected snapshot and re-check completion (the same thing
   * `onPlayerDisconnect` does past grace, without removing them). GameManager
   * re-applies it on each new phase until the player acts or reconnects.
   */
  onStopWaiting?(room: Room, gameState: GameState, playerId: string): GameState | null;

  /**
   * A paused game resumed after `pausedMs`. Phase timers driven by `deltaMs`
   * already stood still (no ticks while paused) — only Date.now() stamps
   * (speed scoring, hint reveal) need shifting here.
   */
  onResume?(pausedMs: number): void;
}
