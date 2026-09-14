// Puzla — a collaborative jigsaw. The host uploads a picture, the game cuts it
// into classic interlocking pieces, and everyone reassembles it together, each
// dragging pieces with a finger on their own phone while the TV mirrors the
// table.
//
// Coordinate space ("table units", used by the server, the wire and both
// renderers alike): the table is PUZLA_TABLE_W × PUZLA_TABLE_H (16:9), origin
// top-left, y grows downward. Nothing here knows about pixels.
//
// Piece shapes are deliberately NOT on the wire: `geo.seed` is enough for every
// client to derive the same tab edges (puzla-rules.ts), and the server never
// needs them at all — snapping is pure grid math.

export type PuzlaPhase = 'pregled' | 'slaganje' | 'kraj' | 'ended';

/** `vreme` — a real deadline; `opusteno` — untimed, the clock only counts up. */
export type PuzlaMode = 'vreme' | 'opusteno';

export interface PuzlaGeometry {
  seed: number;
  cols: number;
  rows: number;
  /** Source image size in px — the sprite builder samples it by cell. */
  imageW: number;
  imageH: number;
  tableW: number;
  tableH: number;
  /** Top-left of the frame the finished picture occupies (= the solved origin). */
  frameX: number;
  frameY: number;
  /** One grid cell, table units. The frame is cols·pw × rows·ph. */
  pw: number;
  ph: number;
}

/**
 * A group on the wire: `[id, x, y, rot, z]`, with x/y the world position of the
 * group's GRID ORIGIN (where cell 0,0 would sit), scaled by PUZLA_WIRE_SCALE
 * and rounded. Piece (c,r) of the group sits at origin + R(rot)·(c·pw, r·ph),
 * so two groups line up exactly when their origins and rotations match — and
 * the solved picture is origin = frame origin, rot 0.
 *
 * Group 0 is the frame itself: every locked piece belongs to it.
 */
export type PuzlaGroupWire = [id: number, x: number, y: number, rot: number, z: number];

export interface PuzlaPlayerRef {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
}

export interface PuzlaRosterEntry extends PuzlaPlayerRef {
  score: number;
  /** Neighbour pairs this player joined (the credit that ranks players). */
  pairs: number;
  /** Drops that put pieces into the frame. */
  locks: number;
}

/**
 * The last structural thing that happened — a join or a lock. `seq` rises per
 * event so a surface flashes and plays a sound exactly once even though the
 * state re-broadcasts. x/y is the centre of the dropped piece, table units.
 */
export interface PuzlaEvent {
  seq: number;
  playerId: string;
  kind: 'spoj' | 'ram';
  /** New neighbour pairs made by this drop. */
  pairs: number;
  points: number;
  x: number;
  y: number;
}

export interface PuzlaResult {
  completed: boolean;
  elapsedSec: number;
  /** Team bonus paid to everyone on completion (time left, in `vreme`). */
  bonus: number;
  /** Who made the drop that finished the picture. */
  finisherId: string | null;
}

export interface PuzlaHostData {
  imageUrl: string;
  geo: PuzlaGeometry;
  mode: PuzlaMode;
  rotation: boolean;
  groups: PuzlaGroupWire[];
  /** Piece index (r·cols + c) → group id. */
  pieceGroup: number[];
  /** groupId → playerId, as of this state. Frames are fresher. */
  holders: Record<string, string>;
  roster: PuzlaRosterEntry[];
  lockedCount: number;
  total: number;
  /** Deadline in seconds for `vreme`, null when untimed. */
  timeLimitSec: number | null;
  /** Seconds spent assembling, as of this state — clients count on locally. */
  elapsedSec: number;
  lastEvent?: PuzlaEvent;
  /** kraj / ended */
  result?: PuzlaResult;
}

/**
 * Positional snapshot broadcast over `game:frame` while anything is held:
 * `[groupId, x, y, rot, playerId]`, scaled like PuzlaGroupWire. Carries EVERY
 * held group (at most one per player), not only the ones that moved, so a
 * phone that just reconnected is right within one frame.
 */
export interface PuzlaFrame {
  seq: number;
  held: [groupId: number, x: number, y: number, rot: number, playerId: string][];
}

export type PuzlaUploadAck =
  | { ok: true; imageId: string; url: string; width: number; height: number }
  | { ok: false; error: string };
