import type {
  Room,
  GameState,
  GeoControllerData,
  GeoGuessMode,
  GeoHostData,
  GeoLeaderboardEntry,
  GeoLocation,
  GeoPin,
  GeoPlayerRoundResult,
  GeoRevealPin,
  GeoSubmissionProgress,
} from '@igra/shared';
import {
  haversineKm,
  latLngToSvg,
  parseCustomPhotoSubmission,
  svgToLatLng,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import {
  DEFAULT_PHOTOS_PER_PLAYER,
  FINAL_LEADERBOARD_DURATION,
  INTRO_DURATION,
  MAX_PHOTOS_PER_PLAYER,
  MAX_PREDEFINED_ROUNDS,
  MIN_PHOTOS_PER_PLAYER,
  PLACING_DURATION,
  REVEAL_DURATION,
  SUBMISSION_DURATION,
  VIEWING_DURATION,
} from './GeoGuessState.js';
import type {
  CustomSubmissionDraft,
  GeoGuessInternalState,
} from './GeoGuessState.js';
import { resolveGeoPack } from './geo-pack-resolver.js';
import { pointsForDistanceKm } from './scoring.js';

interface GeoCustomContent {
  geoPackId?: string;
  geoMode?: GeoGuessMode;
  customPhotosPerPlayer?: number;
  /** Internally injected — the configured GEO_PACKS_DIR (resolved when registering the module). */
  geoPacksDir?: string;
}

function clampPhotosPerPlayer(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_PHOTOS_PER_PLAYER;
  const n = Math.floor(raw);
  if (n < MIN_PHOTOS_PER_PLAYER) return MIN_PHOTOS_PER_PLAYER;
  if (n > MAX_PHOTOS_PER_PLAYER) return MAX_PHOTOS_PER_PLAYER;
  return n;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class GeoGuessModule extends BaseGameModule {
  readonly gameId = 'geo-pogodi';

  /**
   * Configured at construction time so the module can resolve packs from disk.
   * Server's setup wires in the actual directory.
   */
  constructor(private readonly packsDir: string) {
    super();
  }

  private state!: GeoGuessInternalState;

  // -- Lifecycle ----------------------------------------------------------

  validateStart(room: Room, customContent?: unknown): string | null {
    const cc = (customContent as GeoCustomContent | undefined) ?? {};
    if (cc.geoMode === 'custom') {
      const connected = room.players.filter((p) => p.isConnected).length;
      if (connected < 2) {
        return 'Custom mod traži najmanje 2 igrača (svaki igrač pogađa tuđe slike).';
      }
    }
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    const cc = (customContent as GeoCustomContent | undefined) ?? {};
    const mode: GeoGuessMode = cc.geoMode === 'custom' ? 'custom' : 'predefined';

    this.state = {
      phase: 'intro',
      phaseTimeRemaining: INTRO_DURATION,
      mode,
      packName: undefined,
      locations: [],
      currentRoundIndex: 0,
      totalRounds: 0,
      pinsThisRound: new Map(),
      roundResultsHistory: [],
      totalScores: new Map(),
      customSubmissions: new Map(),
      customPhotosPerPlayer: clampPhotosPerPlayer(cc.customPhotosPerPlayer),
      submissionRoster: [],
    };

    // Reset persistent player scores so a previous round of geo-pogodi
    // doesn't bleed into this game's leaderboard.
    for (const player of room.players) {
      player.score = 0;
      this.state.totalScores.set(player.id, 0);
    }

    if (mode === 'custom') {
      this.enterSubmissionPhase(room);
    } else {
      // Predefined: load synchronously-ish via fire-and-forget, but build a
      // placeholder intro state immediately. We can't make onStart async,
      // so we kick off the load and transition to intro once locations land.
      void this.loadPredefinedPack(room, cc.geoPackId);
    }

    return this.buildGameState(room);
  }

  onPlayerAction(
    room: Room,
    _gameState: GameState,
    playerId: string,
    action: string,
    data: Record<string, unknown>
  ): GameState | null {
    switch (action) {
      case 'geo:add-photo':
        return this.handleAddPhoto(room, playerId, data);

      case 'geo:undo-photo':
        return this.handleUndoPhoto(room, playerId);

      case 'geo:place-pin':
        return this.handlePlacePin(room, playerId, data);

      default:
        return null;
    }
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;

    const delta = deltaMs / 1000;
    this.state.phaseTimeRemaining -= delta;

    if (this.state.phaseTimeRemaining <= 0) {
      this.advancePhase(room);
    }

    return this.buildGameState(room);
  }

  onPlayerDisconnect(room: Room, _gameState: GameState, playerId: string): GameState | null {
    if (this.state.phase === 'submission') {
      // If they had no photos at all, drop them from the roster so we don't
      // wait forever for their submissions.
      const count = this.state.customSubmissions.get(playerId)?.length ?? 0;
      if (count === 0) {
        this.state.submissionRoster = this.state.submissionRoster.filter(
          (id) => id !== playerId
        );
        this.state.customSubmissions.delete(playerId);
        this.maybeAdvanceFromSubmission(room);
      }
    }
    // For other phases, nothing to do — we'll record placeholder pins / 0-score
    // when the placing timer expires.
    return this.buildGameState(room);
  }

  onEnd(_room: Room, _gameState: GameState): void {
    // Free the in-memory base64 photos.
    this.state.customSubmissions.clear();
  }

  // -- Predefined-pack loading -------------------------------------------

  private async loadPredefinedPack(room: Room, packId?: string): Promise<void> {
    let resolved = null;
    if (packId) {
      resolved = await resolveGeoPack(this.packsDir, packId);
    }

    if (!resolved || resolved.locations.length === 0) {
      // No pack or no locations — abort to lobby.
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }

    const shuffled = shuffleInPlace([...resolved.locations]);
    const sliced = shuffled.slice(
      0,
      Math.min(MAX_PREDEFINED_ROUNDS, shuffled.length)
    );

    this.state.locations = sliced;
    this.state.totalRounds = sliced.length;
    this.state.packName = resolved.name;
    this.state.currentRoundIndex = 0;
    this.state.phase = 'intro';
    this.state.phaseTimeRemaining = INTRO_DURATION;
    void room;
  }

  // -- Submission phase ---------------------------------------------------

  private enterSubmissionPhase(room: Room): void {
    const connected = room.players.filter((p) => p.isConnected);
    this.state.submissionRoster = connected.map((p) => p.id);
    this.state.phase = 'submission';
    this.state.phaseTimeRemaining = SUBMISSION_DURATION;
    this.state.packName = 'Slike igrača';
    for (const id of this.state.submissionRoster) {
      if (!this.state.customSubmissions.has(id)) {
        this.state.customSubmissions.set(id, []);
      }
    }
  }

  private handleAddPhoto(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'submission') return null;
    if (!this.state.submissionRoster.includes(playerId)) return null;

    const existing = this.state.customSubmissions.get(playerId) ?? [];
    if (existing.length >= this.state.customPhotosPerPlayer) return null;

    const parsed = parseCustomPhotoSubmission(data);
    if (!parsed.ok) return null;

    const draft: CustomSubmissionDraft = parsed.submission;
    existing.push(draft);
    this.state.customSubmissions.set(playerId, existing);

    this.maybeAdvanceFromSubmission(room);
    return this.buildGameState(room);
  }

  private handleUndoPhoto(room: Room, playerId: string): GameState | null {
    if (this.state.phase !== 'submission') return null;
    const existing = this.state.customSubmissions.get(playerId);
    if (!existing || existing.length === 0) return null;
    existing.pop();
    return this.buildGameState(room);
  }

  private maybeAdvanceFromSubmission(room: Room): void {
    if (this.state.submissionRoster.length === 0) return;

    const allDone = this.state.submissionRoster.every((id) => {
      const subs = this.state.customSubmissions.get(id) ?? [];
      return subs.length >= this.state.customPhotosPerPlayer;
    });
    if (!allDone) return;

    // Compose the rounds: every (player, photo) pair becomes one location.
    const all: GeoLocation[] = [];
    let idx = 0;
    for (const playerId of this.state.submissionRoster) {
      const subs = this.state.customSubmissions.get(playerId) ?? [];
      for (const sub of subs) {
        const { lat, lng } = svgToLatLng(sub.pin.x, sub.pin.y);
        idx += 1;
        all.push({
          id: `custom-${idx}`,
          imageUrl: sub.imageBase64,
          lat,
          lng,
          caption: sub.caption,
          contributedBy: playerId,
        });
      }
    }

    shuffleInPlace(all);
    this.state.locations = all;
    this.state.totalRounds = all.length;
    this.state.currentRoundIndex = 0;
    this.state.phase = 'intro';
    this.state.phaseTimeRemaining = INTRO_DURATION;
    void room;
  }

  // -- Placing / reveal / pin actions ------------------------------------

  private handlePlacePin(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'placing') return null;
    if (this.state.pinsThisRound.has(playerId)) return null;

    const player = room.players.find((p) => p.id === playerId);
    if (!player || !player.isConnected) return null;

    const current = this.currentLocation();
    if (!current) return null;
    // The uploader of this round's photo doesn't get to guess.
    if (current.contributedBy === playerId) return null;

    const pin = data.pin as { x?: unknown; y?: unknown } | undefined;
    if (
      !pin ||
      typeof pin.x !== 'number' ||
      typeof pin.y !== 'number' ||
      !Number.isFinite(pin.x) ||
      !Number.isFinite(pin.y) ||
      pin.x < 0 ||
      pin.x > 1 ||
      pin.y < 0 ||
      pin.y > 1
    ) {
      return null;
    }

    this.state.pinsThisRound.set(playerId, { x: pin.x, y: pin.y });

    // Early advance if all eligible guessers have locked in.
    const eligible = this.eligibleGuessersThisRound(room).length;
    if (eligible > 0 && this.state.pinsThisRound.size >= eligible) {
      this.transitionToReveal(room);
    }

    return this.buildGameState(room);
  }

  private eligibleGuessersThisRound(room: Room): string[] {
    const current = this.currentLocation();
    return room.players
      .filter((p) => p.isConnected)
      .filter((p) => current?.contributedBy !== p.id)
      .map((p) => p.id);
  }

  private currentLocation(): GeoLocation | undefined {
    return this.state.locations[this.state.currentRoundIndex];
  }

  // -- Phase machine ------------------------------------------------------

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'submission':
        // Submission has effectively no timer; if it expires we just abort.
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        return;

      case 'intro':
        // Defensive: nothing loaded yet (race between loadPredefinedPack and the tick).
        if (this.state.locations.length === 0) {
          this.state.phaseTimeRemaining = INTRO_DURATION;
          return;
        }
        this.state.phase = 'viewing';
        this.state.phaseTimeRemaining = VIEWING_DURATION;
        return;

      case 'viewing':
        this.state.phase = 'placing';
        this.state.phaseTimeRemaining = PLACING_DURATION;
        this.state.pinsThisRound = new Map();
        return;

      case 'placing':
        this.transitionToReveal(room);
        return;

      case 'reveal':
        this.advanceFromReveal(room);
        return;

      case 'final-leaderboard':
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        return;

      case 'ended':
        return;
    }
  }

  private transitionToReveal(room: Room): void {
    const current = this.currentLocation();
    if (!current) {
      this.state.phase = 'final-leaderboard';
      this.state.phaseTimeRemaining = FINAL_LEADERBOARD_DURATION;
      return;
    }

    const truth = { lat: current.lat, lng: current.lng };
    const results: GeoPlayerRoundResult[] = [];

    for (const player of room.players) {
      // Uploader of this round's photo: no pin, no score.
      if (current.contributedBy === player.id) {
        results.push({
          playerId: player.id,
          name: player.name,
          avatarColor: player.avatarColor,
          pin: null,
          distanceKm: null,
          pointsAwarded: 0,
        });
        continue;
      }

      const pin = this.state.pinsThisRound.get(player.id) ?? null;
      if (!pin) {
        results.push({
          playerId: player.id,
          name: player.name,
          avatarColor: player.avatarColor,
          pin: null,
          distanceKm: null,
          pointsAwarded: 0,
        });
        continue;
      }

      const projected = svgToLatLng(pin.x, pin.y);
      const km = haversineKm(truth, projected);
      const points = pointsForDistanceKm(km);
      results.push({
        playerId: player.id,
        name: player.name,
        avatarColor: player.avatarColor,
        pin,
        distanceKm: km,
        pointsAwarded: points,
      });

      const prev = this.state.totalScores.get(player.id) ?? 0;
      this.state.totalScores.set(player.id, prev + points);
      player.score = prev + points;
    }

    results.sort((a, b) => b.pointsAwarded - a.pointsAwarded);
    this.state.roundResultsHistory.push(results);

    this.state.phase = 'reveal';
    this.state.phaseTimeRemaining = REVEAL_DURATION;
  }

  private advanceFromReveal(_room: Room): void {
    const next = this.state.currentRoundIndex + 1;
    if (next >= this.state.locations.length) {
      this.state.phase = 'final-leaderboard';
      this.state.phaseTimeRemaining = FINAL_LEADERBOARD_DURATION;
      return;
    }
    this.state.currentRoundIndex = next;
    this.state.phase = 'viewing';
    this.state.phaseTimeRemaining = VIEWING_DURATION;
    this.state.pinsThisRound = new Map();
  }

  // -- buildGameState -----------------------------------------------------

  private buildGameState(room: Room): GameState {
    const hostData: GeoHostData = {
      mode: this.state.mode,
      totalRounds: this.state.totalRounds,
      packName: this.state.packName,
      customPhotosPerPlayer: this.state.customPhotosPerPlayer,
    };

    if (this.state.phase === 'submission') {
      hostData.submissionProgress = this.buildSubmissionProgress(room);
      hostData.submissionPending = hostData.submissionProgress.filter(
        (p) => p.submitted < p.total
      ).length;
    }

    if (
      this.state.phase === 'viewing' ||
      this.state.phase === 'placing' ||
      this.state.phase === 'reveal'
    ) {
      const current = this.currentLocation();
      if (current) {
        // For viewing/placing we expose only safe fields (no lat/lng);
        // reveal includes the full location.
        if (this.state.phase === 'reveal') {
          hostData.currentRound = {
            index: this.state.currentRoundIndex,
            total: this.state.totalRounds,
            location: current,
          };
        } else {
          hostData.currentRound = {
            index: this.state.currentRoundIndex,
            total: this.state.totalRounds,
            location: {
              id: current.id,
              imageUrl: current.imageUrl,
              // Hide truth coords during viewing/placing — clients shouldn't
              // be able to peek even via devtools.
              lat: 0,
              lng: 0,
              district: current.district,
              caption: current.caption,
              contributedBy: current.contributedBy,
            },
          };
        }
      }
    }

    if (this.state.phase === 'placing') {
      const eligible = this.eligibleGuessersThisRound(room);
      hostData.totalGuessers = eligible.length;
      hostData.lockedCount = eligible.filter((id) =>
        this.state.pinsThisRound.has(id)
      ).length;
    }

    if (this.state.phase === 'reveal') {
      const last = this.state.roundResultsHistory[
        this.state.roundResultsHistory.length - 1
      ];
      if (last) {
        hostData.roundResults = last;
        hostData.revealPins = last
          .filter((r): r is GeoPlayerRoundResult & { pin: GeoPin; distanceKm: number } =>
            r.pin !== null && r.distanceKm !== null
          )
          .map<GeoRevealPin>((r) => ({
            playerId: r.playerId,
            name: r.name,
            color: r.avatarColor,
            pin: r.pin,
            distanceKm: r.distanceKm,
            points: r.pointsAwarded,
          }));
        const current = this.currentLocation();
        if (current) {
          hostData.truePinSvg = latLngToSvg(current.lat, current.lng);
        }
      }
    }

    if (
      this.state.phase === 'final-leaderboard' ||
      this.state.phase === 'ended'
    ) {
      hostData.finalLeaderboard = this.buildFinalLeaderboard(room);
    }

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      host: hostData,
    };

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      playerData[player.id] = this.buildControllerData(
        room,
        player.id
      ) as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentRoundIndex + 1,
      totalRounds: Math.max(1, this.state.totalRounds),
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  private buildSubmissionProgress(room: Room): GeoSubmissionProgress[] {
    return this.state.submissionRoster
      .map((id) => {
        const player = room.players.find((p) => p.id === id);
        if (!player) return null;
        return {
          playerId: id,
          name: player.name,
          avatarColor: player.avatarColor,
          submitted: this.state.customSubmissions.get(id)?.length ?? 0,
          total: this.state.customPhotosPerPlayer,
        };
      })
      .filter((x): x is GeoSubmissionProgress => x !== null);
  }

  private buildFinalLeaderboard(room: Room): GeoLeaderboardEntry[] {
    const entries = room.players
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        score: this.state.totalScores.get(p.id) ?? 0,
        rank: 0,
      }))
      .sort((a, b) => b.score - a.score);
    let lastScore = -1;
    let lastRank = 0;
    return entries.map((entry, i) => {
      const rank = entry.score === lastScore ? lastRank : i + 1;
      lastScore = entry.score;
      lastRank = rank;
      return { ...entry, rank };
    });
  }

  private buildControllerData(room: Room, playerId: string): GeoControllerData {
    const totalScore = this.state.totalScores.get(playerId) ?? 0;
    const inRoster = this.state.submissionRoster.includes(playerId);

    const base: GeoControllerData = {
      role: 'spectator',
      mode: this.state.mode,
      totalScore,
    };

    switch (this.state.phase) {
      case 'submission': {
        if (!inRoster) return base;
        const subs = this.state.customSubmissions.get(playerId) ?? [];
        return {
          ...base,
          role: 'submitter',
          photosNeeded: this.state.customPhotosPerPlayer,
          photosSubmitted: subs.length,
        };
      }

      case 'placing': {
        const current = this.currentLocation();
        if (!current) return base;
        const isOwn = current.contributedBy === playerId;
        const player = room.players.find((p) => p.id === playerId);
        if (isOwn) {
          return {
            ...base,
            role: 'spectator',
            isOwnPhoto: true,
          };
        }
        if (!player?.isConnected) return base;
        const pin = this.state.pinsThisRound.get(playerId);
        return {
          ...base,
          role: 'guesser',
          hasLocked: pin !== undefined,
          ownPin: pin,
          isOwnPhoto: false,
        };
      }

      case 'reveal': {
        const last = this.state.roundResultsHistory[
          this.state.roundResultsHistory.length - 1
        ];
        const mine = last?.find((r) => r.playerId === playerId);
        if (mine) {
          const ownRoundRank =
            last && mine.pin
              ? last.filter((r) => r.pin !== null).findIndex((r) => r.playerId === playerId) + 1
              : undefined;
          return {
            ...base,
            role: 'spectator',
            ownDistanceKm: mine.distanceKm ?? undefined,
            ownPoints: mine.pointsAwarded,
            ownRoundRank: ownRoundRank && ownRoundRank > 0 ? ownRoundRank : undefined,
          };
        }
        return base;
      }

      case 'intro':
      case 'viewing':
      case 'final-leaderboard':
      case 'ended':
      default:
        return base;
    }
  }
}
