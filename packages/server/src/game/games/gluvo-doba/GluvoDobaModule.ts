import type {
  Room,
  GameState,
  GluvoDobaControllerData,
  GluvoDobaDeath,
  GluvoDobaFinalRole,
  GluvoDobaHostData,
  GluvoDobaPlayerInfo,
  GluvoDobaRoleId,
  GluvoDobaTargetOption,
} from '@igra/shared';
import {
  GLUVO_DOBA_ROLES,
  REVEAL_ROLE_ON_DEATH,
  assignRoles,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import type {
  GluvoDobaDeathRecord,
  GluvoDobaInternalState,
} from './GluvoDobaState.js';
import {
  DEFAULT_DISCUSSION_DURATION,
  GLASANJE_DURATION,
  KRAJ_DURATION,
  MAX_DISCUSSION_DURATION,
  MIN_DISCUSSION_DURATION,
  NOC_DURATION,
  OSVETA_DURATION,
  PODELA_ULOGA_DURATION,
  PRESUDA_DURATION,
  ZORA_DURATION,
} from './GluvoDobaState.js';
import { resolveNight } from './night-resolution.js';

interface GluvoDobaCustomContent {
  gluvoDobaDiscussionSeconds?: number;
}

function clampDiscussion(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_DISCUSSION_DURATION;
  }
  const n = Math.floor(raw);
  if (n < MIN_DISCUSSION_DURATION) return MIN_DISCUSSION_DURATION;
  if (n > MAX_DISCUSSION_DURATION) return MAX_DISCUSSION_DURATION;
  return n;
}

// Identity snapshot taken at game start so names/colors survive a player
// being permanently removed from the room mid-game (dead phones still get
// named in dawn announcements and the final role table).
interface ParticipantInfo {
  name: string;
  avatarColor: string;
  avatarEmoji: string;
}

export class GluvoDobaModule extends BaseGameModule {
  readonly gameId = 'gluvo-doba';

  private state!: GluvoDobaInternalState;
  private info = new Map<string, ParticipantInfo>();
  // Deaths applied+announced at the most recent zora/presuda entry.
  private announcedDeaths: GluvoDobaDeathRecord[] = [];

  validateStart(room: Room): string | null {
    const connected = room.players.filter((p) => p.isConnected).length;
    if (connected < 6) return 'Gluvo doba traži bar 6 igrača.';
    if (connected > 15) return 'Gluvo doba prima najviše 15 igrača.';
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    const opts = (customContent as GluvoDobaCustomContent | undefined) ?? {};
    const participants = room.players.filter((p) => p.isConnected);

    this.info = new Map(
      participants.map((p) => [
        p.id,
        {
          name: p.name,
          avatarColor: p.avatarColor,
          avatarEmoji: p.avatarEmoji,
        },
      ])
    );

    this.state = {
      phase: 'podela-uloga',
      phaseTimeRemaining: PODELA_ULOGA_DURATION,
      day: 0,
      discussionDuration: clampDiscussion(opts.gluvoDobaDiscussionSeconds),
      roles: assignRoles(participants.map((p) => p.id)),
      alive: new Set(participants.map((p) => p.id)),
      nightActions: new Map(),
      expectedActorIds: new Set(),
      expectedGhostIds: new Set(),
      ghostVotes: new Map(),
      zduhacTargetId: null,
      lastProtectedId: null,
      lastEnchantedId: null,
      enchantedTonightId: null,
      pendingDeaths: [],
      whisperTop: [],
      osvetaContext: null,
      sudjajaId: null,
      osvetaVictimId: null,
      dayVotes: new Map(),
      expectedVoterIds: new Set(),
      lynchedId: null,
      lastVoteTally: [],
      lastSkipVotes: 0,
      seerHistory: [],
      zduhacHistory: [],
      winner: null,
    };
    this.announcedDeaths = [];

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
      case 'gluvo:night-action':
        return this.handleNightAction(room, playerId, data);
      case 'gluvo:ghost-vote':
        return this.handleGhostVote(room, playerId, data);
      case 'gluvo:vote':
        return this.handleVote(room, playerId, data);
      case 'gluvo:osveta':
        return this.handleOsveta(room, playerId, data);
      default:
        return null;
    }
  }

  onHostAction(
    room: Room,
    _gameState: GameState,
    action: string
  ): GameState | null {
    switch (action) {
      case 'gluvo:skip-discussion':
        if (this.state.phase !== 'diskusija') return null;
        this.enterGlasanje(room);
        return this.buildGameState(room);
      case 'gluvo:end-now':
        if (this.state.phase !== 'kraj') return null;
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        return this.buildGameState(room);
      default:
        return null;
    }
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;

    this.state.phaseTimeRemaining -= deltaMs / 1000;
    if (this.state.phaseTimeRemaining <= 0) {
      this.advanceOnTimeout(room);
    }
    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    if (this.state.phase === 'ended') return null;
    if (!this.state.roles.has(playerId)) return this.buildGameState(room);

    if (this.state.alive.has(playerId)) {
      // A living player gone past grace vanishes from the village. No
      // Suđaja revenge on a disappearance — only a real death triggers it.
      this.state.alive.delete(playerId);
      this.state.pendingDeaths.push({ playerId, cause: 'disappeared' });
      this.state.expectedActorIds.delete(playerId);
      this.state.expectedVoterIds.delete(playerId);
      this.state.dayVotes.delete(playerId);

      if (this.state.phase === 'osveta' && playerId === this.state.sudjajaId) {
        // The avenger's phone is gone — fate stays unspun.
        this.finishOsveta(room);
        return this.buildGameState(room);
      }

      if (this.checkWinner(room)) {
        if (this.state.phase !== 'kraj') this.enterKraj();
        return this.buildGameState(room);
      }

      if (this.state.phase === 'noc' && this.nightComplete(room)) {
        this.finishNight(room);
      } else if (this.state.phase === 'glasanje' && this.allVoted(room)) {
        this.finishVoting(room);
      }
    } else {
      // A ghost left — don't let the Zduhać's question wait on them.
      this.state.expectedGhostIds.delete(playerId);
      if (this.state.phase === 'noc' && this.nightComplete(room)) {
        this.finishNight(room);
      }
    }

    return this.buildGameState(room);
  }

  // --- Player actions ----------------------------------------------------

  private handleNightAction(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'noc') return null;
    if (!this.state.alive.has(playerId)) return null;
    if (!this.state.expectedActorIds.has(playerId)) return null;
    if (this.state.nightActions.has(playerId)) return null;

    const targetId = data.targetId as string;
    if (!this.validNightTargets(playerId).includes(targetId)) return null;

    this.state.nightActions.set(playerId, targetId);

    const role = this.state.roles.get(playerId);
    if (role && GLUVO_DOBA_ROLES[role].nightActionType === 'ask-dead') {
      // This is what pushes the da/ne question to the ghosts' phones.
      this.state.zduhacTargetId = targetId;
    }

    if (this.nightComplete(room)) this.finishNight(room);
    return this.buildGameState(room);
  }

  private handleGhostVote(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'noc') return null;
    if (this.state.zduhacTargetId === null) return null;
    if (!this.state.roles.has(playerId)) return null;
    if (this.state.alive.has(playerId)) return null;
    // Not gated on expectedGhostIds: a ghost who reconnected after the
    // night started may still answer — they just don't block early-exit.
    if (this.state.ghostVotes.has(playerId)) return null;

    const vote = data.vote;
    if (vote !== 'da' && vote !== 'ne') return null;

    this.state.ghostVotes.set(playerId, vote);
    if (this.nightComplete(room)) this.finishNight(room);
    return this.buildGameState(room);
  }

  private handleVote(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'glasanje') return null;
    if (!this.state.alive.has(playerId)) return null;
    if (!this.state.expectedVoterIds.has(playerId)) return null;
    if (this.state.dayVotes.has(playerId)) return null;

    const targetId = data.targetId as string;
    const valid =
      targetId === 'skip' ||
      (this.state.alive.has(targetId) && targetId !== playerId);
    if (!valid) return null;

    this.state.dayVotes.set(playerId, targetId);
    if (this.allVoted(room)) this.finishVoting(room);
    return this.buildGameState(room);
  }

  private handleOsveta(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'osveta') return null;
    if (playerId !== this.state.sudjajaId) return null;
    if (this.state.osvetaVictimId !== null) return null;

    const targetId = data.targetId as string;
    if (!this.osvetaTargetIds().includes(targetId)) return null;

    this.state.osvetaVictimId = targetId;
    this.state.pendingDeaths.push({ playerId: targetId, cause: 'osveta' });
    this.finishOsveta(room);
    return this.buildGameState(room);
  }

  // --- Phase machine -----------------------------------------------------

  private advanceOnTimeout(room: Room): void {
    switch (this.state.phase) {
      case 'podela-uloga':
        this.enterNoc(room);
        break;
      case 'noc':
        this.finishNight(room);
        break;
      case 'osveta':
        this.finishOsveta(room);
        break;
      case 'zora':
        if (this.state.winner) this.enterKraj();
        else this.enterDiskusija();
        break;
      case 'diskusija':
        this.enterGlasanje(room);
        break;
      case 'glasanje':
        this.finishVoting(room);
        break;
      case 'presuda':
        if (this.state.winner) this.enterKraj();
        else this.enterNoc(room);
        break;
      case 'kraj':
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        break;
    }
  }

  private enterNoc(room: Room): void {
    this.state.nightActions = new Map();
    this.state.ghostVotes = new Map();
    this.state.zduhacTargetId = null;
    this.state.enchantedTonightId = null;
    this.state.whisperTop = [];
    // Snapshot every living player — a mid-grace disconnected phone keeps
    // its slot until the timer or its permanent removal, so a screen going
    // dark can't shrink the "did everyone act?" denominator.
    this.state.expectedActorIds = new Set(this.state.alive);
    // Ghosts eligible to answer the Zduhać: dead participants currently
    // connected. Players dying THIS night join only from the next one.
    this.state.expectedGhostIds = new Set(
      [...this.state.roles.keys()].filter(
        (id) =>
          !this.state.alive.has(id) &&
          room.players.find((p) => p.id === id)?.isConnected === true
      )
    );
    this.state.phase = 'noc';
    this.state.phaseTimeRemaining = NOC_DURATION;
  }

  private nightComplete(room: Room): boolean {
    if (this.state.phase !== 'noc') return false;
    const stillInRoom = (id: string) =>
      room.players.some((p) => p.id === id);
    for (const id of this.state.expectedActorIds) {
      if (this.state.nightActions.has(id)) continue;
      if (!stillInRoom(id)) continue;
      return false;
    }
    if (this.state.zduhacTargetId !== null) {
      for (const id of this.state.expectedGhostIds) {
        if (this.state.ghostVotes.has(id)) continue;
        if (!stillInRoom(id)) continue;
        return false;
      }
    }
    return true;
  }

  private finishNight(room: Room): void {
    const night = this.state.day + 1;
    const outcome = resolveNight({
      roles: this.state.roles,
      alive: this.state.alive,
      nightActions: this.state.nightActions,
      lastProtectedId: this.state.lastProtectedId,
      ghostVotes: this.state.ghostVotes,
      zduhacTargetId: this.state.zduhacTargetId,
      night,
      nameOf: (id) => this.nameOf(id),
    });

    this.state.enchantedTonightId = outcome.enchantedTonightId;
    this.state.lastEnchantedId = outcome.enchantedTonightId;
    this.state.lastProtectedId = outcome.newLastProtectedId;
    if (outcome.seerEntry) this.state.seerHistory.push(outcome.seerEntry);
    if (outcome.zduhacEntry) this.state.zduhacHistory.push(outcome.zduhacEntry);
    this.state.whisperTop = outcome.whisperTop;

    if (
      outcome.wolfVictimId &&
      !this.state.pendingDeaths.some(
        (d) => d.playerId === outcome.wolfVictimId
      )
    ) {
      this.state.pendingDeaths.push({
        playerId: outcome.wolfVictimId,
        cause: 'wolves',
      });
    }

    const sudjajaPending = this.state.pendingDeaths.find(
      (d) =>
        d.cause !== 'disappeared' &&
        this.state.roles.get(d.playerId) === 'sudjaja'
    );
    if (sudjajaPending && this.isConnected(room, sudjajaPending.playerId)) {
      this.enterOsveta('night', sudjajaPending.playerId);
    } else {
      this.enterZora(room);
    }
  }

  private enterOsveta(context: 'night' | 'lynch', sudjajaId: string): void {
    this.state.osvetaContext = context;
    this.state.sudjajaId = sudjajaId;
    this.state.osvetaVictimId = null;
    this.state.phase = 'osveta';
    this.state.phaseTimeRemaining = OSVETA_DURATION;
  }

  private finishOsveta(room: Room): void {
    const context = this.state.osvetaContext;
    this.state.osvetaContext = null;
    if (context === 'lynch') this.enterPresuda(room);
    else this.enterZora(room);
  }

  private enterZora(room: Room): void {
    this.applyPendingDeaths();
    this.state.day += 1;
    this.checkWinner(room);
    this.state.phase = 'zora';
    this.state.phaseTimeRemaining = ZORA_DURATION;
  }

  private enterDiskusija(): void {
    this.state.phase = 'diskusija';
    this.state.phaseTimeRemaining = this.state.discussionDuration;
  }

  private enterGlasanje(_room: Room): void {
    this.state.dayVotes = new Map();
    this.state.expectedVoterIds = new Set(this.state.alive);
    this.state.lynchedId = null;
    this.state.lastVoteTally = [];
    this.state.lastSkipVotes = 0;
    this.state.phase = 'glasanje';
    this.state.phaseTimeRemaining = GLASANJE_DURATION;
  }

  private allVoted(room: Room): boolean {
    if (this.state.phase !== 'glasanje') return false;
    for (const id of this.state.expectedVoterIds) {
      if (this.state.dayVotes.has(id)) continue;
      if (!room.players.some((p) => p.id === id)) continue;
      return false;
    }
    return true;
  }

  private finishVoting(room: Room): void {
    const counts = new Map<string, number>();
    let skip = 0;
    for (const targetId of this.state.dayVotes.values()) {
      if (targetId === 'skip') skip += 1;
      else counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }

    this.state.lastVoteTally = [...counts.entries()]
      .map(([playerId, votes]) => ({ playerId, votes }))
      .sort((a, b) => b.votes - a.votes);
    this.state.lastSkipVotes = skip;

    let top = 0;
    for (const c of counts.values()) top = Math.max(top, c);
    const topTargets = [...counts.entries()]
      .filter(([, c]) => c === top)
      .map(([id]) => id);

    // The village hangs someone only on a clear verdict: a unique top
    // target with more votes than the skips.
    this.state.lynchedId =
      top > 0 && topTargets.length === 1 && skip < top ? topTargets[0] : null;

    if (this.state.lynchedId) {
      this.state.pendingDeaths.push({
        playerId: this.state.lynchedId,
        cause: 'lynch',
      });
      if (
        this.state.roles.get(this.state.lynchedId) === 'sudjaja' &&
        this.isConnected(room, this.state.lynchedId)
      ) {
        this.enterOsveta('lynch', this.state.lynchedId);
        return;
      }
    }
    this.enterPresuda(room);
  }

  private enterPresuda(room: Room): void {
    this.applyPendingDeaths();
    this.checkWinner(room);
    this.state.phase = 'presuda';
    this.state.phaseTimeRemaining = PRESUDA_DURATION;
  }

  private enterKraj(): void {
    this.state.phase = 'kraj';
    this.state.phaseTimeRemaining = KRAJ_DURATION;
  }

  private applyPendingDeaths(): void {
    for (const record of this.state.pendingDeaths) {
      this.state.alive.delete(record.playerId);
    }
    this.announcedDeaths = this.state.pendingDeaths;
    this.state.pendingDeaths = [];
  }

  /** Returns true (and records the winner) when one side has won. */
  private checkWinner(room: Room): boolean {
    if (this.state.winner) return true;

    let wolves = 0;
    for (const id of this.state.alive) {
      if (this.state.roles.get(id) === 'vukodlak') wolves += 1;
    }
    const others = this.state.alive.size - wolves;

    if (wolves === 0) this.state.winner = 'selo';
    else if (wolves >= others) this.state.winner = 'vukodlaci';

    if (this.state.winner) {
      // Team win/loss as 1/0 so the platform's final-scores screen isn't a
      // flat tie — this game has no points of its own.
      for (const player of room.players) {
        const role = this.state.roles.get(player.id);
        if (!role) continue;
        const team = GLUVO_DOBA_ROLES[role].team;
        player.score = team === this.state.winner ? 1 : 0;
      }
      return true;
    }
    return false;
  }

  // --- Helpers -----------------------------------------------------------

  private nameOf(playerId: string): string {
    return this.info.get(playerId)?.name ?? '?';
  }

  private isConnected(room: Room, playerId: string): boolean {
    return room.players.find((p) => p.id === playerId)?.isConnected === true;
  }

  private roleOf(playerId: string): GluvoDobaRoleId | undefined {
    return this.state.roles.get(playerId);
  }

  private validNightTargets(playerId: string): string[] {
    const role = this.roleOf(playerId);
    if (!role) return [];
    const def = GLUVO_DOBA_ROLES[role];
    return [...this.state.alive].filter((id) => {
      if (id === playerId) return false;
      if (def.noRepeatTarget) {
        if (def.nightActionType === 'protect' && id === this.state.lastProtectedId)
          return false;
        if (def.nightActionType === 'enchant' && id === this.state.lastEnchantedId)
          return false;
      }
      return true;
    });
  }

  private osvetaTargetIds(): string[] {
    const pendingDead = new Set(
      this.state.pendingDeaths.map((d) => d.playerId)
    );
    return [...this.state.alive].filter(
      (id) => id !== this.state.sudjajaId && !pendingDead.has(id)
    );
  }

  private targetOptions(ids: string[]): GluvoDobaTargetOption[] {
    return ids.map((id) => {
      const info = this.info.get(id);
      return {
        playerId: id,
        name: info?.name ?? '?',
        avatarColor: info?.avatarColor ?? '#888888',
        avatarEmoji: info?.avatarEmoji ?? '❓',
      };
    });
  }

  private toDeath(record: GluvoDobaDeathRecord): GluvoDobaDeath {
    const death: GluvoDobaDeath = {
      playerId: record.playerId,
      name: this.nameOf(record.playerId),
      cause: record.cause,
    };
    if (REVEAL_ROLE_ON_DEATH) {
      death.roleId = this.roleOf(record.playerId);
    }
    return death;
  }

  // --- Build state -------------------------------------------------------

  private buildGameState(room: Room): GameState {
    const hostData = this.buildHostData(room);

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      host: hostData,
    };

    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      playerData[player.id] = this.buildControllerData(
        player.id
      ) as unknown as Record<string, unknown>;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: Math.max(1, this.state.day),
      totalRounds: Math.max(1, this.state.day),
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  /**
   * Shared data, broadcast to every device. Never put role identities of
   * living players, night targets, or pre-presuda vote choices in here —
   * anonymous aggregates only.
   */
  private buildHostData(room: Room): GluvoDobaHostData {
    const players: GluvoDobaPlayerInfo[] = [...this.state.roles.keys()].map(
      (id) => {
        const info = this.info.get(id);
        return {
          playerId: id,
          name: info?.name ?? '?',
          avatarColor: info?.avatarColor ?? '#888888',
          avatarEmoji: info?.avatarEmoji ?? '❓',
          alive: this.state.alive.has(id),
        };
      }
    );

    const hostData: GluvoDobaHostData = {
      day: Math.max(1, this.state.day),
      players,
    };

    if (this.state.phase === 'noc') {
      const stillHere = [...this.state.expectedActorIds].filter((id) =>
        room.players.some((p) => p.id === id)
      );
      hostData.totalActors = stillHere.length;
      hostData.actedCount = stillHere.filter((id) =>
        this.state.nightActions.has(id)
      ).length;
    }

    if (this.state.phase === 'osveta') {
      // Night-context osveta must stay neutral — the room isn't allowed to
      // know that the Suđaja fell before dawn breaks.
      hostData.osvetaPublic = this.state.osvetaContext === 'lynch';
    }

    if (this.state.phase === 'zora' || this.state.phase === 'presuda') {
      hostData.deaths = this.announcedDeaths.map((d) => this.toDeath(d));
    }

    if (this.state.phase === 'zora') {
      hostData.whisperTop = this.state.whisperTop;
    }

    if (this.state.phase === 'glasanje') {
      const stillHere = [...this.state.expectedVoterIds].filter((id) =>
        room.players.some((p) => p.id === id)
      );
      hostData.totalVoters = stillHere.length;
      hostData.votedCount = stillHere.filter((id) =>
        this.state.dayVotes.has(id)
      ).length;
    }

    if (this.state.phase === 'presuda') {
      hostData.lynched = this.state.lynchedId
        ? this.toDeath({ playerId: this.state.lynchedId, cause: 'lynch' })
        : null;
      hostData.voteTally = this.state.lastVoteTally.map((t) => ({
        playerId: t.playerId,
        name: this.nameOf(t.playerId),
        votes: t.votes,
      }));
      hostData.skipVotes = this.state.lastSkipVotes;
      hostData.osvetaVictim = this.state.osvetaVictimId
        ? this.toDeath({
            playerId: this.state.osvetaVictimId,
            cause: 'osveta',
          })
        : null;
    }

    if (this.state.phase === 'kraj' || this.state.phase === 'ended') {
      hostData.winner = this.state.winner ?? undefined;
      hostData.finalRoles = [...this.state.roles.entries()].map(
        ([id, roleId]): GluvoDobaFinalRole => {
          const info = this.info.get(id);
          return {
            playerId: id,
            name: info?.name ?? '?',
            avatarColor: info?.avatarColor ?? '#888888',
            avatarEmoji: info?.avatarEmoji ?? '❓',
            roleId,
            alive: this.state.alive.has(id),
          };
        }
      );
    }

    return hostData;
  }

  private buildControllerData(playerId: string): GluvoDobaControllerData {
    const roleId = this.roleOf(playerId);
    if (!roleId) {
      // Joined mid-game — watches from the sidelines with no secrets.
      return { alive: false };
    }

    const alive = this.state.alive.has(playerId);
    const pd: GluvoDobaControllerData = { roleId, alive };

    if (roleId === 'vukodlak') {
      pd.packMates = [...this.state.roles.entries()]
        .filter(([id, r]) => r === 'vukodlak' && id !== playerId)
        .map(([id]) => ({ playerId: id, name: this.nameOf(id) }));
      if (this.state.phase === 'noc' && alive) {
        pd.packPicks = [...this.state.nightActions.entries()]
          .filter(
            ([actorId]) =>
              actorId !== playerId &&
              this.roleOf(actorId) === 'vukodlak'
          )
          .map(([actorId, targetId]) => ({
            name: this.nameOf(actorId),
            targetName: this.nameOf(targetId),
          }));
      }
    }

    if (roleId === 'vidovnjak') pd.seerHistory = this.state.seerHistory;
    if (roleId === 'zduhac') pd.zduhacHistory = this.state.zduhacHistory;

    if (this.state.phase === 'noc') {
      if (alive) {
        pd.canAct = this.state.expectedActorIds.has(playerId);
        pd.hasActed = this.state.nightActions.has(playerId);
        if (pd.canAct && !pd.hasActed) {
          pd.targets = this.targetOptions(this.validNightTargets(playerId));
        }
      } else {
        pd.ghostQuestion = this.state.zduhacTargetId
          ? { targetName: this.nameOf(this.state.zduhacTargetId) }
          : null;
        pd.hasGhostVoted = this.state.ghostVotes.has(playerId);
      }
    }

    if (!alive) {
      // The dead see everything — spectating with full knowledge is the
      // ghosts' consolation prize (and feeds honest/lying Zduhać answers).
      pd.allRoles = [...this.state.roles.entries()].map(([id, r]) => ({
        name: this.nameOf(id),
        roleId: r,
      }));
    }

    if (this.state.phase === 'glasanje' && alive) {
      pd.hasVoted = this.state.dayVotes.has(playerId);
      if (!pd.hasVoted) {
        pd.voteOptions = this.targetOptions(
          [...this.state.alive].filter((id) => id !== playerId)
        );
      }
    }

    if (this.state.phase === 'osveta' && playerId === this.state.sudjajaId) {
      pd.isAvenger = true;
      pd.osvetaTargets = this.targetOptions(this.osvetaTargetIds());
    }

    return pd;
  }
}
