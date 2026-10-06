// Bedem — tower defense played on the phone. Enemies walk a fixed path on a
// portrait grid, players tap empty cells to build towers.
//
// Coordinate space: "cell units". Cell (c, r) spans [c, c+1] × [r, r+1], so its
// centre is (c + .5, r + .5). An enemy's position is a single number — `dist`,
// how far it has walked along the path polyline — which keeps the simulation
// trivial and the wire tiny; both ends turn it back into x/y with the same
// pure helper (`bedemPathPoint`).

export type BedemPhase = 'uvod' | 'gradnja' | 'talas' | 'kraj' | 'ended';

/** 'zajedno' = one shared map and base; 'protiv' = a map each, send enemies to the others. */
export type BedemMode = 'zajedno' | 'protiv';
/** kratko / standard = a fixed number of waves; beskonacno = until the base falls. */
export type BedemLength = 'kratko' | 'standard' | 'beskonacno';

export type BedemTowerType = 'strelac' | 'katapult' | 'led' | 'munja';
export type BedemEnemyType = 'vuk' | 'pesak' | 'oklopnik' | 'roj' | 'azdaja';
/** What a player in 'protiv' can send to an opponent. */
export type BedemSendType = 'vuk' | 'oklopnik' | 'roj';

export interface BedemTower {
  id: number;
  c: number;
  r: number;
  type: BedemTowerType;
  /** 1–3 */
  level: number;
  ownerId: string;
  /** Gold spent on it so far — the sale refund is a share of this. */
  spent: number;
}

/** One enemy inside a frame. Terse on purpose: it ships ~10× per second. */
export interface BedemFrameEnemy {
  /** id, unique per map for the whole game */
  i: number;
  t: BedemEnemyType;
  /** distance along the path, cell units, 2 decimals */
  d: number;
  /** hp left, 0–100 % */
  h: number;
  /** slowed right now */
  s: boolean;
}

/** A tower firing since the previous frame: tower id → enemy ids it hit. */
export interface BedemFrameShot {
  t: number;
  e: number[];
}

/** Enemies sent at this map that haven't arrived yet ('protiv'). */
export interface BedemFrameIncoming {
  u: BedemSendType;
  /** sender id */
  f: string;
  /** ms until it arrives */
  ms: number;
}

export interface BedemFrameMap {
  /** null on the shared map ('zajedno') */
  o: string | null;
  l: number;
  e: BedemFrameEnemy[];
  s: BedemFrameShot[];
  /** enemies that broke through since the previous frame */
  x: number;
  p?: BedemFrameIncoming[];
}

/**
 * A simulation snapshot, broadcast room-wide over `game:frame`. Nothing in a
 * tower defense is secret, so it needs no host/player split.
 */
export interface BedemFrame {
  /** Monotonic per game — clients drop out-of-order frames. */
  seq: number;
  maps: BedemFrameMap[];
  /** playerId → gold right now (gold moves on every kill, so it rides the frame). */
  g: Record<string, number>;
}

export interface BedemPlayerRef {
  playerId: string;
  name: string;
  avatarColor: string;
  avatarEmoji: string;
}

export interface BedemRosterEntry extends BedemPlayerRef {
  gold: number;
  score: number;
  kills: number;
  /** 'protiv': still defending. Always true in 'zajedno'. */
  alive: boolean;
  /** 'protiv': place once out (1 = winner); 0 while still in. */
  place: number;
}

export interface BedemMapState {
  ownerId: string | null;
  lives: number;
  alive: boolean;
  towers: BedemTower[];
}

export interface BedemResultEntry extends BedemPlayerRef {
  rank: number;
  score: number;
  kills: number;
  /** 'protiv': waves this player's base survived. */
  waves: number;
}

export interface BedemResult {
  /** 'zajedno': the base held through every wave. Always false in endless. */
  won: boolean;
  /** Waves fully survived (by the team, or by the winner in 'protiv'). */
  wavesSurvived: number;
  entries: BedemResultEntry[];
}

export interface BedemHostData {
  mode: BedemMode;
  length: BedemLength;
  layoutId: string;
  cols: number;
  rows: number;
  /** Path waypoints, cell coordinates (first above the grid, last below it). */
  path: [number, number][];
  wave: number;
  /** null = endless */
  totalWaves: number | null;
  /** The next wave has a boss (shown during gradnja). */
  bossNext: boolean;
  maps: BedemMapState[];
  roster: BedemRosterEntry[];
  /** gradnja: who pressed "Spreman" (public — nothing to hide). */
  readyIds: string[];
  /** kraj / ended */
  result?: BedemResult;
}

export interface BedemControllerData {
  /** Index into hostData.maps of the map this player defends. */
  mapIndex: number;
  gold: number;
  score: number;
  kills: number;
}
