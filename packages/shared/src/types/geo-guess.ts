/**
 * Wire types for the "Pogodi gde je" (geo-pogodi) game.
 *
 * Two modes:
 *  - 'predefined' — locations served by the server from GEO_PACKS_DIR.
 *  - 'custom'     — players upload N photos each in a submission phase, then
 *                   guess each other's. A player never receives their own photo.
 *
 * Coordinates use two systems and conversion happens via serbia-projection.ts:
 *  - Geographic {lat, lng} — authoritative truth, used for haversine distance.
 *  - SVG normalized {x, y} ∈ [0, 1] — what controllers tap and broadcast.
 *
 * The server projects controller pins → lat/lng before scoring, so SVG pixel
 * differences across devices never affect results.
 */

export type GeoGuessPhase =
  | 'submission'
  | 'intro'
  | 'viewing'
  | 'placing'
  | 'reveal'
  | 'final-leaderboard'
  | 'ended';

export type GeoGuessMode = 'predefined' | 'custom';

/**
 * Serbian administrative districts (okruzi) plus the City of Belgrade.
 * Used optionally to tag predefined locations and to group / filter packs.
 */
export type SerbianDistrict =
  | 'severnobacki'
  | 'srednjebanatski'
  | 'severnobanatski'
  | 'juznobanatski'
  | 'zapadnobacki'
  | 'juznobacki'
  | 'sremski'
  | 'macvanski'
  | 'kolubarski'
  | 'podunavski'
  | 'branicevski'
  | 'sumadijski'
  | 'pomoravski'
  | 'borski'
  | 'zajecarski'
  | 'zlatiborski'
  | 'moravicki'
  | 'raski'
  | 'rasinski'
  | 'niski'
  | 'toplicki'
  | 'pirotski'
  | 'jablanicki'
  | 'pcinjski'
  | 'beograd';

export const SERBIAN_DISTRICTS: readonly SerbianDistrict[] = [
  'severnobacki',
  'srednjebanatski',
  'severnobanatski',
  'juznobanatski',
  'zapadnobacki',
  'juznobacki',
  'sremski',
  'macvanski',
  'kolubarski',
  'podunavski',
  'branicevski',
  'sumadijski',
  'pomoravski',
  'borski',
  'zajecarski',
  'zlatiborski',
  'moravicki',
  'raski',
  'rasinski',
  'niski',
  'toplicki',
  'pirotski',
  'jablanicki',
  'pcinjski',
  'beograd',
] as const;

export const DISTRICT_LABELS: Record<SerbianDistrict, string> = {
  severnobacki: 'Severnobački',
  srednjebanatski: 'Srednjebanatski',
  severnobanatski: 'Severnobanatski',
  juznobanatski: 'Južnobanatski',
  zapadnobacki: 'Zapadnobački',
  juznobacki: 'Južnobački',
  sremski: 'Sremski',
  macvanski: 'Mačvanski',
  kolubarski: 'Kolubarski',
  podunavski: 'Podunavski',
  branicevski: 'Braničevski',
  sumadijski: 'Šumadijski',
  pomoravski: 'Pomoravski',
  borski: 'Borski',
  zajecarski: 'Zaječarski',
  zlatiborski: 'Zlatiborski',
  moravicki: 'Moravički',
  raski: 'Raški',
  rasinski: 'Rasinski',
  niski: 'Nišavski',
  toplicki: 'Toplički',
  pirotski: 'Pirotski',
  jablanicki: 'Jablanički',
  pcinjski: 'Pčinjski',
  beograd: 'Beograd',
};

export interface GeoLocation {
  id: string;
  /** Either /geo-images/<pack>/<file> or data:image/jpeg;base64,... for custom mode. */
  imageUrl: string;
  lat: number;
  lng: number;
  district?: SerbianDistrict;
  caption?: string;
  /** Player id for custom-mode photos — used to skip own photo for the uploader. */
  contributedBy?: string;
}

/** A pin location in the host's SVG, normalized to [0, 1] on each axis. */
export interface GeoPin {
  x: number;
  y: number;
}

export interface GeoRound {
  index: number;
  total: number;
  location: GeoLocation;
}

export interface GeoPlayerRoundResult {
  playerId: string;
  name: string;
  avatarColor: string;
  pin: GeoPin | null;
  distanceKm: number | null;
  pointsAwarded: number;
}

export interface GeoLeaderboardEntry {
  playerId: string;
  name: string;
  avatarColor: string;
  score: number;
  rank: number;
}

export interface GeoSubmissionProgress {
  playerId: string;
  name: string;
  avatarColor: string;
  submitted: number;
  total: number;
}

export interface GeoRevealPin {
  playerId: string;
  name: string;
  color: string;
  pin: GeoPin;
  distanceKm: number;
  points: number;
}

export interface GeoHostData {
  mode: GeoGuessMode;
  totalRounds: number;
  packName?: string;
  /** Set in intro/viewing/placing/reveal. Image url + caption are public; lat/lng leak only after reveal. */
  currentRound?: GeoRound;
  /** placing — how many of the eligible guessers have locked in. */
  lockedCount?: number;
  totalGuessers?: number;
  /** reveal — full per-player round results, sorted by points desc. */
  roundResults?: GeoPlayerRoundResult[];
  /** reveal — pins to render on the map (alias of roundResults but only with pin set). */
  revealPins?: GeoRevealPin[];
  /** reveal — projected from the truth's lat/lng for drawing the gold pin. */
  truePinSvg?: GeoPin;
  /** final-leaderboard. */
  finalLeaderboard?: GeoLeaderboardEntry[];
  /** submission — per-player count + total. */
  submissionProgress?: GeoSubmissionProgress[];
  customPhotosPerPlayer?: number;
  /** Total connected players who still need to submit (custom mode). */
  submissionPending?: number;
}

export type GeoControllerRole = 'submitter' | 'guesser' | 'spectator';

export interface GeoControllerData {
  role: GeoControllerRole;
  mode: GeoGuessMode;
  /** submission — N to upload, current count. */
  photosNeeded?: number;
  photosSubmitted?: number;
  /** placing — has the player locked their pin yet? */
  hasLocked?: boolean;
  ownPin?: GeoPin;
  /** placing — true iff the current round's photo was uploaded by this player. */
  isOwnPhoto?: boolean;
  /** reveal — own delta. */
  ownDistanceKm?: number;
  ownPoints?: number;
  ownRoundRank?: number;
  /** Cumulative score across all rounds. */
  totalScore?: number;
}
