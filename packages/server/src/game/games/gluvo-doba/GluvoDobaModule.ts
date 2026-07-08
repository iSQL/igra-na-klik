import type {
  Room,
  GameState,
  GluvoDobaControllerData,
  GluvoDobaDeath,
  GluvoDobaDeathReveal,
  GluvoDobaFinalRole,
  GluvoDobaHostData,
  GluvoDobaPlayerInfo,
  GluvoDobaRoleId,
  GluvoDobaTargetOption,
} from '@igra/shared';
import {
  GLUVO_DOBA_ROLES,
  assignRoles,
  dealRolesFromPack,
  parseGluvoDobaPack,
} from '@igra/shared';
import type { GluvoDobaPack } from '@igra/shared';
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
  gluvoDobaDeathReveal?: GluvoDobaDeathReveal;
  gluvoDobaFirstNightPeace?: boolean;
  gluvoDobaNeutral?: boolean;
  gluvoDobaVila?: boolean;
  gluvoDobaBajacica?: boolean;
  gluvoDobaPack?: GluvoDobaPack;
}

const DAY_PHASES = new Set(['zora', 'diskusija', 'glasanje', 'presuda']);

function clampDiscussion(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_DISCUSSION_DURATION;
  }
  const n = Math.floor(raw);
  if (n < MIN_DISCUSSION_DURATION) return MIN_DISCUSSION_DURATION;
  if (n > MAX_DISCUSSION_DURATION) return MAX_DISCUSSION_DURATION;
  return n;
}

function parseDeathReveal(raw: unknown): GluvoDobaDeathReveal {
  return raw === 'role' || raw === 'none' ? raw : 'team';
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
  // The match's role composition — open setup knowledge, computed once.
  private rolesInPlay: { roleId: GluvoDobaRoleId; count: number }[] = [];
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

    // A selected pack fully defines the roster; otherwise fall back to the
    // built-in player-count bands + the individual role toggles. The client
    // may send an untrusted pack object, so re-validate it here.
    const ids = participants.map((p) => p.id);
    const parsedPack =
      opts.gluvoDobaPack !== undefined
        ? parseGluvoDobaPack(opts.gluvoDobaPack)
        : null;
    const roles =
      parsedPack && parsedPack.ok
        ? dealRolesFromPack(ids, parsedPack.pack)
        : assignRoles(ids, {
            neutral: opts.gluvoDobaNeutral === true,
            vila: opts.gluvoDobaVila === true,
            bajacica: opts.gluvoDobaBajacica === true,
          });

    this.state = {
      phase: 'podela-uloga',
      phaseTimeRemaining: PODELA_ULOGA_DURATION,
      day: 0,
      discussionDuration: clampDiscussion(opts.gluvoDobaDiscussionSeconds),
      deathReveal: parseDeathReveal(opts.gluvoDobaDeathReveal),
      firstNightPeace: opts.gluvoDobaFirstNightPeace !== false,
      roles,
      alive: new Set(participants.map((p) => p.id)),
      nightActions: new Map(),
      expectedActorIds: new Set(),
      lastProtectedId: null,
      lastEnchantedId: null,
      enchantedTonightId: null,
      blockedLastNightId: null,
      zduhacSaveUsed: false,
      zduhacSavedAnnouncement: null,
      mutedTodayId: null,
      announcePeacefulFirstNight: false,
      bajacicaTargetId: null,
      ghostVotes: new Map(),
      expectedGhostIds: new Set(),
      pendingDeaths: [],
      whisperTop: [],
      osvetaContext: null,
      sudjajaId: null,
      osvetaVictimId: null,
      knezRevealedId: null,
      dayVotes: new Map(),
      expectedVoterIds: new Set(),
      lynchedId: null,
      lastVoteTally: [],
      lastSkipVotes: 0,
      seerHistory: [],
      bajacicaHistory: [],
      winner: null,
      moranaWon: false,
    };
    this.announcedDeaths = [];

    const counts = new Map<GluvoDobaRoleId, number>();
    for (const roleId of roles.values()) {
      counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
    }
    const teamOrder = { vukodlaci: 0, selo: 1, neutralci: 2 };
    this.rolesInPlay = [...counts.entries()]
      .map(([roleId, count]) => ({ roleId, count }))
      .sort(
        (a, b) =>
          teamOrder[GLUVO_DOBA_ROLES[a.roleId].team] -
            teamOrder[GLUVO_DOBA_ROLES[b.roleId].team] ||
          GLUVO_DOBA_ROLES[a.roleId].name.localeCompare(
            GLUVO_DOBA_ROLES[b.roleId].name
          )
      );

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
      case 'gluvo:vote':
        return this.handleVote(room, playerId, data);
      case 'gluvo:osveta':
        return this.handleOsveta(room, playerId, data);
      case 'gluvo:ghost-vote':
        return this.handleGhostVote(room, playerId, data);
      case 'gluvo:knez-reveal':
        return this.handleKnezReveal(room, playerId);
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
        this.enterGlasanje();
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
      // A ghost left — don't let the Bajačica's question wait on them.
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

    // The Bajačica's submission is what pushes her yes/no question to the
    // ghosts — until then their phones show only the role list.
    if (this.roleOf(playerId) === 'bajacica') {
      this.state.bajacicaTargetId = targetId;
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
    if (this.state.bajacicaTargetId === null) return null;
    if (!this.state.roles.has(playerId)) return null;
    // Only the dead answer the Bajačica.
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

  private handleKnezReveal(room: Room, playerId: string): GameState | null {
    if (!DAY_PHASES.has(this.state.phase)) return null;
    if (this.state.phase === 'presuda') return null; // vote already settled
    if (!this.state.alive.has(playerId)) return null;
    if (this.roleOf(playerId) !== 'knez') return null;
    if (this.state.knezRevealedId !== null) return null;

    this.state.knezRevealedId = playerId;
    return this.buildGameState(room);
  }

  // --- Phase machine -----------------------------------------------------

  private advanceOnTimeout(room: Room): void {
    switch (this.state.phase) {
      case 'podela-uloga':
        this.enterNoc();
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
        this.enterGlasanje();
        break;
      case 'glasanje':
        this.finishVoting(room);
        break;
      case 'presuda':
        if (this.state.winner) this.enterKraj();
        else this.enterNoc();
        break;
      case 'kraj':
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
        break;
    }
  }

  private enterNoc(): void {
    this.state.nightActions = new Map();
    this.state.enchantedTonightId = null;
    this.state.whisperTop = [];
    // Yesterday's afflictions expire with the new night.
    this.state.blockedLastNightId = null;
    this.state.mutedTodayId = null;
    this.state.zduhacSavedAnnouncement = null;
    this.state.announcePeacefulFirstNight = false;
    this.state.bajacicaTargetId = null;
    this.state.ghostVotes = new Map();
    // Snapshot every living player — a mid-grace disconnected phone keeps
    // its slot until the timer or its permanent removal, so a screen going
    // dark can't shrink the "did everyone act?" denominator.
    this.state.expectedActorIds = new Set(this.state.alive);
    // Ghosts eligible to answer the Bajačica: everyone already dead at
    // night's start. Players who die THIS night join only from the next
    // one. The phase timer bounds the wait if a dead phone never answers.
    this.state.expectedGhostIds = new Set(
      [...this.state.roles.keys()].filter((id) => !this.state.alive.has(id))
    );
    this.state.phase = 'noc';
    this.state.phaseTimeRemaining = NOC_DURATION;
  }

  private nightComplete(room: Room): boolean {
    if (this.state.phase !== 'noc') return false;
    for (const id of this.state.expectedActorIds) {
      if (this.state.nightActions.has(id)) continue;
      if (!room.players.some((p) => p.id === id)) continue;
      return false;
    }
    // Once the Bajačica has asked, hold the night open for the ghosts to
    // answer (bounded by the phase timer either way).
    if (this.state.bajacicaTargetId !== null) {
      for (const id of this.state.expectedGhostIds) {
        if (this.state.ghostVotes.has(id)) continue;
        if (!room.players.some((p) => p.id === id)) continue;
        return false;
      }
    }
    return true;
  }

  private isPeacefulNight(night: number): boolean {
    return this.state.firstNightPeace && night === 1;
  }

  private isMoranaKillNight(night: number): boolean {
    return night % 2 === 0;
  }

  private finishNight(room: Room): void {
    const night = this.state.day + 1;
    const outcome = resolveNight({
      roles: this.state.roles,
      alive: this.state.alive,
      nightActions: this.state.nightActions,
      lastProtectedId: this.state.lastProtectedId,
      night,
      peacefulNight: this.isPeacefulNight(night),
      moranaKillNight: this.isMoranaKillNight(night),
      zduhacSaveUsed: this.state.zduhacSaveUsed,
      bajacicaTargetId: this.state.bajacicaTargetId,
      ghostVotes: this.state.ghostVotes,
      nameOf: (id) => this.nameOf(id),
    });

    this.state.enchantedTonightId = outcome.enchantedTonightId;
    this.state.lastEnchantedId = outcome.enchantedTonightId;
    this.state.lastProtectedId = outcome.newLastProtectedId;
    this.state.blockedLastNightId = outcome.blockedId;
    this.state.mutedTodayId = outcome.mutedTodayId;
    this.state.announcePeacefulFirstNight = this.isPeacefulNight(night);
    if (outcome.seerEntry) this.state.seerHistory.push(outcome.seerEntry);
    if (outcome.bajacicaEntry) {
      this.state.bajacicaHistory.push(outcome.bajacicaEntry);
    }
    if (outcome.zduhacSavedBy) {
      this.state.zduhacSaveUsed = true;
      this.state.zduhacSavedAnnouncement = { playerId: outcome.zduhacSavedBy };
    }
    this.state.whisperTop = outcome.whisperTop;

    for (const death of outcome.deaths) {
      if (
        !this.state.pendingDeaths.some((d) => d.playerId === death.playerId)
      ) {
        this.state.pendingDeaths.push(death);
      }
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

  private enterGlasanje(): void {
    this.state.dayVotes = new Map();
    // Bauk's victim sits today's vote out.
    this.state.expectedVoterIds = new Set(
      [...this.state.alive].filter((id) => id !== this.state.mutedTodayId)
    );
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
    for (const [voterId, targetId] of this.state.dayVotes) {
      // A publicly revealed Knez speaks with the weight of two.
      const weight = voterId === this.state.knezRevealedId ? 2 : 1;
      if (targetId === 'skip') skip += weight;
      else counts.set(targetId, (counts.get(targetId) ?? 0) + weight);
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

    let darkAlive = 0;
    for (const id of this.state.alive) {
      if (this.teamOf(id) === 'vukodlaci') darkAlive += 1;
    }
    const othersAlive = this.state.alive.size - darkAlive;
    const moranaId = this.playerWithRole('morana');
    const moranaAlive = moranaId !== null && this.state.alive.has(moranaId);

    // Morana's endgame overrides everything: down to the last two, with
    // her among them, the goddess of death claims the village.
    if (moranaAlive && this.state.alive.size <= 2) {
      this.state.winner = 'neutralci';
      this.state.moranaWon = true;
    } else if (darkAlive > 0 && darkAlive >= othersAlive) {
      this.state.winner = 'vukodlaci';
    } else if (darkAlive === 0 && !moranaAlive) {
      // The village isn't safe while Morana still walks — with her alive
      // the game continues even after the last wolf falls.
      this.state.winner = 'selo';
    }

    if (this.state.winner) {
      for (const player of room.players) {
        const role = this.state.roles.get(player.id);
        if (!role) continue;
        let won: boolean;
        if (this.state.moranaWon) {
          won = role === 'morana';
        } else {
          won = GLUVO_DOBA_ROLES[role].team === this.state.winner;
        }
        // Lesnik's own victory: surviving to the end, whoever wins.
        if (role === 'lesnik' && this.state.alive.has(player.id)) won = true;
        player.score = won ? 1 : 0;
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

  private teamOf(playerId: string): string | undefined {
    const role = this.roleOf(playerId);
    return role ? GLUVO_DOBA_ROLES[role].team : undefined;
  }

  private playerWithRole(roleId: GluvoDobaRoleId): string | null {
    for (const [id, r] of this.state.roles) {
      if (r === roleId) return id;
    }
    return null;
  }

  private playerWithLivingRole(roleId: GluvoDobaRoleId): string | null {
    for (const [id, r] of this.state.roles) {
      if (r === roleId && this.state.alive.has(id)) return id;
    }
    return null;
  }

  private validNightTargets(playerId: string): string[] {
    const role = this.roleOf(playerId);
    if (!role) return [];
    const def = GLUVO_DOBA_ROLES[role];
    return [...this.state.alive].filter((id) => {
      if (id === playerId) return false;
      if (def.noRepeatTarget) {
        if (
          def.nightActionType === 'protect' &&
          id === this.state.lastProtectedId
        )
          return false;
        if (
          def.nightActionType === 'enchant' &&
          id === this.state.lastEnchantedId
        )
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
    const role = this.roleOf(record.playerId);
    if (role) {
      if (this.state.deathReveal === 'role') death.roleId = role;
      else if (this.state.deathReveal === 'team') {
        death.team = GLUVO_DOBA_ROLES[role].team;
      }
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
   * anonymous aggregates only. Public by design: rolesInPlay (open setup),
   * knezRevealed (his day power), zduhacSaved (the price of his save),
   * mutedToday (the village verifies the missing vote).
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
      rolesInPlay: this.rolesInPlay,
    };

    if (this.state.knezRevealedId) {
      hostData.knezRevealed = {
        playerId: this.state.knezRevealedId,
        name: this.nameOf(this.state.knezRevealedId),
      };
    }

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
      if (this.state.announcePeacefulFirstNight) {
        hostData.peacefulFirstNight = true;
      }
      if (this.state.zduhacSavedAnnouncement) {
        hostData.zduhacSaved = {
          playerId: this.state.zduhacSavedAnnouncement.playerId,
          name: this.nameOf(this.state.zduhacSavedAnnouncement.playerId),
        };
      }
    }

    if (
      this.state.mutedTodayId &&
      (this.state.phase === 'zora' ||
        this.state.phase === 'diskusija' ||
        this.state.phase === 'glasanje')
    ) {
      hostData.mutedToday = {
        playerId: this.state.mutedTodayId,
        name: this.nameOf(this.state.mutedTodayId),
      };
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
      hostData.moranaWon = this.state.moranaWon || undefined;
      const lesnikId = this.playerWithRole('lesnik');
      if (lesnikId && this.state.alive.has(lesnikId)) {
        hostData.lesnikSurvived = {
          playerId: lesnikId,
          name: this.nameOf(lesnikId),
        };
      }
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

    const def = GLUVO_DOBA_ROLES[roleId];
    const alive = this.state.alive.has(playerId);
    const pd: GluvoDobaControllerData = { roleId, alive };
    const night = this.state.day + 1;

    if (def.team === 'vukodlaci') {
      // The whole dark pack knows each other; the wolves' kill picks are
      // shared with the pack for coordination.
      pd.packMates = [...this.state.roles.entries()]
        .filter(
          ([id, r]) =>
            id !== playerId && GLUVO_DOBA_ROLES[r].team === 'vukodlaci'
        )
        .map(([id]) => ({ playerId: id, name: this.nameOf(id) }));
      if (this.state.phase === 'noc' && alive) {
        pd.packPicks = [...this.state.nightActions.entries()]
          .filter(([actorId]) => {
            if (actorId === playerId) return false;
            const r = this.roleOf(actorId);
            return r ? GLUVO_DOBA_ROLES[r].nightActionType === 'kill-vote' : false;
          })
          .map(([actorId, targetId]) => ({
            name: this.nameOf(actorId),
            targetName: this.nameOf(targetId),
          }));
      }
      if (roleId === 'vampir') {
        // The Vampir inherits the pack (his own pick decides) once no
        // Vukodlak is left alive.
        pd.vampirLeader = !this.playerWithLivingRole('vukodlak');
      }
    }

    if (roleId === 'vidovnjak') pd.seerHistory = this.state.seerHistory;
    if (roleId === 'bajacica') pd.bajacicaHistory = this.state.bajacicaHistory;
    if (roleId === 'zduhac') {
      pd.zduhacSaveAvailable = !this.state.zduhacSaveUsed;
    }

    if (this.state.phase === 'noc' && alive) {
      pd.canAct = this.state.expectedActorIds.has(playerId);
      pd.hasActed = this.state.nightActions.has(playerId);
      if (pd.canAct && !pd.hasActed) {
        pd.targets = this.targetOptions(this.validNightTargets(playerId));
      }
      if (def.nightActionType === 'kill-vote' && this.isPeacefulNight(night)) {
        pd.peacefulNight = true;
      }
      if (roleId === 'morana') {
        pd.moranaKillTonight = this.isMoranaKillNight(night);
      }
    }

    if (!alive) {
      // The dead see everything — spectating with full knowledge is the
      // ghosts' consolation prize (and lets them answer the Bajačica
      // truthfully or, if dark-aligned, lie).
      pd.allRoles = [...this.state.roles.entries()].map(([id, r]) => ({
        name: this.nameOf(id),
        roleId: r,
      }));
      if (this.state.phase === 'noc') {
        pd.ghostQuestion = this.state.bajacicaTargetId
          ? { targetName: this.nameOf(this.state.bajacicaTargetId) }
          : null;
        pd.hasGhostVoted = this.state.ghostVotes.has(playerId);
      }
    }

    if (DAY_PHASES.has(this.state.phase)) {
      if (playerId === this.state.blockedLastNightId) {
        pd.blockedLastNight = true;
      }
      if (
        roleId === 'knez' &&
        alive &&
        this.state.knezRevealedId === null &&
        this.state.phase !== 'presuda'
      ) {
        pd.canKnezReveal = true;
      }
    }

    if (this.state.phase === 'glasanje' && alive) {
      if (playerId === this.state.mutedTodayId) {
        pd.muted = true;
      } else {
        pd.hasVoted = this.state.dayVotes.has(playerId);
        if (!pd.hasVoted && this.state.expectedVoterIds.has(playerId)) {
          pd.voteOptions = this.targetOptions(
            [...this.state.alive].filter((id) => id !== playerId)
          );
        }
      }
    }

    if (this.state.phase === 'osveta' && playerId === this.state.sudjajaId) {
      pd.isAvenger = true;
      pd.osvetaTargets = this.targetOptions(this.osvetaTargetIds());
    }

    return pd;
  }
}
