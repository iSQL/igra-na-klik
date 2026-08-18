import type {
  GameState,
  Room,
  SpijunAccusationTally,
  SpijunControllerData,
  SpijunHostData,
  SpijunLeaderboardEntry,
  SpijunLocation,
  SpijunPack,
  SpijunPlayerInfo,
  SpijunPlayerResult,
  SpijunRole,
  SpijunRoundOutcome,
} from '@igra/shared';
import {
  SPIJUN_LOCATIONS,
  clampGameRounds,
  parseSpijunPack,
  shuffled,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import type { SpijunInternalState } from './SpijunState.js';
import {
  DEFAULT_DISCUSSION_SECONDS,
  DEFENSE_DURATION,
  INITIATOR_BONUS,
  MAX_DISCUSSION_SECONDS,
  MIN_DISCUSSION_SECONDS,
  PLAYER_CATCH_POINTS,
  RESULTS_DURATION,
  REVEAL_ROLE_DURATION,
  SPY_DECLARED_GUESS_DURATION,
  SPY_EARLY_GUESS_MAX_BONUS,
  SPY_FAILED_DECLARATION_BONUS,
  SPY_GUESS_DURATION,
  SPY_GUESS_POINTS,
  SPY_WRONG_ACCUSATION_POINTS,
  VOTING_DURATION,
} from './SpijunState.js';

interface SpijunCustomContent {
  spijunDiscussionSeconds?: number;
  spijunPack?: SpijunPack;
  spijunTutorial?: boolean;
  roundCount?: number;
}

function clampDiscussion(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_DISCUSSION_SECONDS;
  }
  const n = Math.round(raw);
  if (n < MIN_DISCUSSION_SECONDS) return MIN_DISCUSSION_SECONDS;
  if (n > MAX_DISCUSSION_SECONDS) return MAX_DISCUSSION_SECONDS;
  return n;
}

/**
 * Špijun (Spyfall-style): everyone knows the secret location except the spy.
 * Live Q&A out loud, phone-driven accusations → defense → secret ballot,
 * and a spy location-guess when the clock runs out.
 *
 * Anti-leak doctrine: the secret location, per-player roles and the spy's
 * identity live ONLY in playerData slices. The shared host data carries the
 * public candidate-location list, anonymous accusation counts, and reveals
 * the spy only in `spy-guess` (tabletop self-reveal rule) and `results`.
 */
export class SpijunModule extends BaseGameModule {
  readonly gameId = 'spijun';

  private state!: SpijunInternalState;
  private timings: Record<string, number> = {};
  /** Targets that survived a vote this round — immune to re-accusation. */
  private immuneIds = new Set<string>();

  validateStart(room: Room): string | null {
    const connected = room.players.filter((p) => p.isConnected).length;
    if (connected < 3) return 'Špijun traži bar 3 povezana igrača.';
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const opts = (customContent as SpijunCustomContent | undefined) ?? {};

    // The client-supplied pack is untrusted — re-validate, strict (no empty).
    let locationList: SpijunLocation[] = SPIJUN_LOCATIONS;
    if (opts.spijunPack !== undefined) {
      const parsed = parseSpijunPack(opts.spijunPack);
      if (parsed.ok) locationList = parsed.pack.locations;
    }

    this.state = {
      phase: 'reveal-role',
      phaseTimeRemaining: this.timings.REVEAL_ROLE_DURATION ?? REVEAL_ROLE_DURATION,
      tutorialMode: opts.spijunTutorial === true,
      totalRounds: clampGameRounds(this.gameId, opts.roundCount),
      currentRound: 1,
      discussionSeconds: clampDiscussion(opts.spijunDiscussionSeconds),
      discussionRemaining: 0,
      locationList,
      participantIds: [],
      currentLocation: null,
      spyId: null,
      rolesByPlayer: new Map(),
      accusations: new Map(),
      accuseThreshold: 2,
      accusedId: null,
      initiatorId: null,
      votes: new Map(),
      expectedVoterIds: new Set(),
      spyGuess: null,
      spyDeclared: false,
      spyDeclaredRemaining: 0,
      outcome: null,
      voteYes: 0,
      voteNo: 0,
      roundScores: new Map(),
      usedLocationNames: new Set(),
      usedSpyIds: new Set(),
    };

    this.startRound(room);
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
      case 'spijun:accuse':
        return this.handleAccuse(room, playerId, data);
      case 'spijun:vote':
        return this.handleVote(room, playerId, data);
      case 'spijun:declare':
        return this.handleDeclare(room, playerId);
      case 'spijun:spy-guess':
        return this.handleSpyGuess(room, playerId, data);
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
      case 'spijun:skip-discussion':
        if (this.state.phase !== 'discussion') return null;
        this.enterSpyGuess(room);
        return this.buildGameState(room);
      case 'spijun:next-phase':
        // Tutorial flow control: execute exactly what the timeout would.
        if (!this.state.tutorialMode || this.state.phase === 'ended') return null;
        this.advanceOnTimeout(room);
        return this.buildGameState(room);
      default:
        return null;
    }
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    if (this.state.phase === 'ended') return null;

    if (!this.state.tutorialMode) {
      this.state.phaseTimeRemaining -= deltaMs / 1000;
      if (this.state.phase === 'discussion') {
        this.state.discussionRemaining = this.state.phaseTimeRemaining;
      }
      if (this.state.phaseTimeRemaining <= 0) {
        this.advanceOnTimeout(room);
      }
    }
    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    // Prune any accusations by or against the departed player.
    this.state.accusations.delete(playerId);
    for (const [accuser, target] of [...this.state.accusations]) {
      if (target === playerId) this.state.accusations.delete(accuser);
    }

    const isSpy = playerId === this.state.spyId;
    switch (this.state.phase) {
      case 'reveal-role':
      case 'discussion':
        // The spy fleeing hands the village the round.
        if (isSpy) this.resolveResults(room, 'spy-missed');
        break;
      case 'defense':
      case 'voting':
        if (playerId === this.state.accusedId) {
          // The accused fleeing mid-trial: a spy is caught, an innocent's
          // exit just cancels the vote.
          if (isSpy) this.resolveResults(room, 'spy-caught');
          else this.resumeDiscussion(room);
        } else if (isSpy) {
          this.resolveResults(room, 'spy-missed');
        } else if (this.state.phase === 'voting') {
          this.state.expectedVoterIds.delete(playerId);
          this.state.votes.delete(playerId);
          if (this.allExpectedVoted(room)) this.finishVoting(room);
        }
        break;
      case 'spy-guess':
        if (isSpy) this.resolveResults(room, 'spy-missed');
        break;
    }
    return this.buildGameState(room);
  }

  onEnd(_room: Room, _gameState: GameState): void {
    this.state.usedLocationNames.clear();
    this.state.usedSpyIds.clear();
  }

  // --- Player actions ----------------------------------------------------

  private handleAccuse(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'discussion') return null;
    if (!this.state.participantIds.includes(playerId)) return null;
    if (!this.isConnected(room, playerId)) return null;

    const targetId = data.targetId as string;
    if (!targetId || targetId === playerId) return null;
    if (!this.state.participantIds.includes(targetId)) return null;
    if (!this.isConnected(room, targetId)) return null;
    if (this.immuneIds.has(targetId)) return null;

    // Re-accusing replaces the previous pick (and moves the accuser to the
    // end of the insertion order — the initiator is the EARLIEST accuser
    // still pointing at the target when the threshold trips).
    this.state.accusations.delete(playerId);
    this.state.accusations.set(playerId, targetId);

    let count = 0;
    for (const t of this.state.accusations.values()) {
      if (t === targetId) count++;
    }
    if (count >= this.state.accuseThreshold) {
      this.enterDefense(targetId);
    }
    return this.buildGameState(room);
  }

  private handleVote(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'voting') return null;
    if (!this.state.expectedVoterIds.has(playerId)) return null;
    if (this.state.votes.has(playerId)) return null;

    const vote = data.vote;
    if (vote !== 'da' && vote !== 'ne') return null;

    this.state.votes.set(playerId, vote);
    if (this.allExpectedVoted(room)) this.finishVoting(room);
    return this.buildGameState(room);
  }

  /**
   * "Znam lokaciju!" — the spy stops the discussion themselves (tabletop
   * rule). Only from `discussion`, so a spy can't dodge an active trial by
   * declaring mid-vote; the remaining clock is banked for the score bonus.
   */
  private handleDeclare(room: Room, playerId: string): GameState | null {
    if (this.state.phase !== 'discussion') return null;
    if (playerId !== this.state.spyId) return null;
    if (!this.isConnected(room, playerId)) return null;
    if (this.state.spyDeclared) return null;

    this.state.spyDeclared = true;
    this.state.spyDeclaredRemaining = Math.max(
      0,
      Math.ceil(this.state.phaseTimeRemaining)
    );
    this.enterSpyGuess(room);
    return this.buildGameState(room);
  }

  private handleSpyGuess(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'spy-guess') return null;
    if (playerId !== this.state.spyId) return null;
    if (this.state.spyGuess !== null) return null;

    const location = data.location as string;
    if (
      !location ||
      !this.state.locationList.some((l) => l.location === location)
    ) {
      return null;
    }

    this.state.spyGuess = location;
    const correct = location === this.state.currentLocation?.location;
    this.resolveResults(room, correct ? 'spy-guessed' : 'spy-missed');
    return this.buildGameState(room);
  }

  // --- Round lifecycle ---------------------------------------------------

  private startRound(room: Room): void {
    const connected = room.players.filter((p) => p.isConnected);
    if (connected.length < 3) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }

    this.state.participantIds = shuffled(connected.map((p) => p.id));
    this.state.currentLocation = this.pickLocation();
    this.state.spyId = this.pickSpy(this.state.participantIds);

    // Deal location roles to the non-spies (roles repeat if outnumbered).
    this.state.rolesByPlayer = new Map();
    const roles = shuffled(this.state.currentLocation.roles);
    let i = 0;
    for (const id of this.state.participantIds) {
      if (id === this.state.spyId) continue;
      this.state.rolesByPlayer.set(id, roles[i % roles.length]);
      i++;
    }

    // Majority of the round's participants must point at one target.
    this.state.accuseThreshold = Math.ceil(this.state.participantIds.length / 2);
    this.state.discussionRemaining = this.state.discussionSeconds;
    this.state.accusations = new Map();
    this.immuneIds = new Set();
    this.state.accusedId = null;
    this.state.initiatorId = null;
    this.state.votes = new Map();
    this.state.expectedVoterIds = new Set();
    this.state.spyGuess = null;
    this.state.spyDeclared = false;
    this.state.spyDeclaredRemaining = 0;
    this.state.outcome = null;
    this.state.voteYes = 0;
    this.state.voteNo = 0;
    this.state.roundScores = new Map();
    this.state.phase = 'reveal-role';
    this.state.phaseTimeRemaining =
      this.timings.REVEAL_ROLE_DURATION ?? REVEAL_ROLE_DURATION;
  }

  private advanceOnTimeout(room: Room): void {
    switch (this.state.phase) {
      case 'reveal-role':
        this.state.phase = 'discussion';
        this.state.phaseTimeRemaining = this.state.discussionRemaining;
        break;
      case 'discussion':
        this.enterSpyGuess(room);
        break;
      case 'defense':
        this.enterVoting(room);
        break;
      case 'voting':
        this.finishVoting(room);
        break;
      case 'spy-guess':
        // No guess in time — counts as a miss.
        this.resolveResults(room, 'spy-missed');
        break;
      case 'results':
        this.nextRoundOrEnd(room);
        break;
    }
  }

  private enterDefense(targetId: string): void {
    // Freeze the discussion clock for the trial.
    this.state.discussionRemaining = Math.max(
      0,
      this.state.phaseTimeRemaining
    );
    this.state.accusedId = targetId;
    this.state.initiatorId = this.findInitiator(targetId);
    this.state.votes = new Map();
    this.state.phase = 'defense';
    this.state.phaseTimeRemaining = DEFENSE_DURATION;
  }

  private findInitiator(targetId: string): string | null {
    for (const [accuser, target] of this.state.accusations) {
      if (target === targetId) return accuser;
    }
    return null;
  }

  private enterVoting(room: Room): void {
    this.state.votes = new Map();
    this.state.expectedVoterIds = new Set(
      room.players
        .filter(
          (p) =>
            p.isConnected &&
            p.id !== this.state.accusedId &&
            this.state.participantIds.includes(p.id)
        )
        .map((p) => p.id)
    );
    this.state.phase = 'voting';
    this.state.phaseTimeRemaining = VOTING_DURATION;
    if (this.state.expectedVoterIds.size === 0) this.finishVoting(room);
  }

  private finishVoting(room: Room): void {
    let yes = 0;
    let no = 0;
    for (const v of this.state.votes.values()) {
      if (v === 'da') yes++;
      else no++;
    }
    this.state.voteYes = yes;
    this.state.voteNo = no;

    const votedOut = yes > no; // tie → benefit of the doubt
    const accusedId = this.state.accusedId;
    if (votedOut && accusedId) {
      if (accusedId === this.state.spyId) {
        this.resolveResults(room, 'spy-caught');
      } else {
        this.resolveResults(room, 'wrong-accusation');
      }
    } else {
      // Survived — immune to re-accusation for the rest of the round.
      if (accusedId) this.immuneIds.add(accusedId);
      this.resumeDiscussion(room);
    }
  }

  private resumeDiscussion(room: Room): void {
    this.state.accusations = new Map();
    this.state.accusedId = null;
    this.state.initiatorId = null;
    this.state.votes = new Map();
    this.state.expectedVoterIds = new Set();
    if (this.state.discussionRemaining <= 1) {
      this.enterSpyGuess(room);
      return;
    }
    this.state.phase = 'discussion';
    this.state.phaseTimeRemaining = this.state.discussionRemaining;
  }

  private enterSpyGuess(room: Room): void {
    if (!this.state.spyId || !this.isConnected(room, this.state.spyId)) {
      this.resolveResults(room, 'spy-missed');
      return;
    }
    this.state.phase = 'spy-guess';
    this.state.phaseTimeRemaining = this.state.spyDeclared
      ? SPY_DECLARED_GUESS_DURATION
      : SPY_GUESS_DURATION;
  }

  private resolveResults(room: Room, outcome: SpijunRoundOutcome): void {
    this.state.outcome = outcome;
    const scores = new Map<string, number>();
    for (const player of room.players) {
      if (!this.state.participantIds.includes(player.id)) continue;
      let pts = 0;
      if (player.id === this.state.spyId) {
        if (outcome === 'spy-guessed') {
          pts = SPY_GUESS_POINTS + this.earlyGuessBonus();
        } else if (outcome === 'wrong-accusation') {
          pts = SPY_WRONG_ACCUSATION_POINTS;
        }
      } else if (outcome === 'spy-caught' || outcome === 'spy-missed') {
        pts = PLAYER_CATCH_POINTS;
        if (outcome === 'spy-caught' && player.id === this.state.initiatorId) {
          pts += INITIATOR_BONUS;
        }
        // A spy who called it and blew it pays the whole village.
        if (outcome === 'spy-missed' && this.state.spyDeclared) {
          pts += SPY_FAILED_DECLARATION_BONUS;
        }
      }
      scores.set(player.id, pts);
      player.score += pts;
    }
    this.state.roundScores = scores;
    this.state.phase = 'results';
    this.state.phaseTimeRemaining =
      this.timings.RESULTS_DURATION ?? RESULTS_DURATION;
  }

  private nextRoundOrEnd(room: Room): void {
    if (this.state.currentRound < this.state.totalRounds) {
      this.state.currentRound += 1;
      this.startRound(room);
    } else {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
    }
  }

  // --- Helpers -----------------------------------------------------------

  /**
   * Bonus for a correct guess after a self-declaration, linear in the share
   * of the discussion clock the spy left on the table. Zero when the clock
   * simply ran out (no declaration).
   */
  private earlyGuessBonus(): number {
    if (!this.state.spyDeclared) return 0;
    const total = this.state.discussionSeconds;
    if (total <= 0) return 0;
    const share = Math.min(1, Math.max(0, this.state.spyDeclaredRemaining / total));
    return Math.round(SPY_EARLY_GUESS_MAX_BONUS * share);
  }

  private isConnected(room: Room, playerId: string): boolean {
    return room.players.find((p) => p.id === playerId)?.isConnected === true;
  }

  private pickLocation(): SpijunLocation {
    const available = this.state.locationList.filter(
      (l) => !this.state.usedLocationNames.has(l.location)
    );
    const pool = available.length > 0 ? available : this.state.locationList;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    this.state.usedLocationNames.add(chosen.location);
    return chosen;
  }

  private pickSpy(participantIds: string[]): string {
    const fresh = participantIds.filter((id) => !this.state.usedSpyIds.has(id));
    const pool = fresh.length > 0 ? fresh : participantIds;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    this.state.usedSpyIds.add(chosen);
    return chosen;
  }

  private allExpectedVoted(room: Room): boolean {
    if (this.state.phase !== 'voting') return false;
    for (const id of this.state.expectedVoterIds) {
      if (this.state.votes.has(id)) continue;
      // Mid-grace disconnected players stay expected (they may reconnect and
      // vote); only permanent removal prunes the set.
      const stillInRoom = room.players.some((p) => p.id === id);
      if (!stillInRoom) continue;
      return false;
    }
    return true;
  }

  private roleFor(playerId: string): SpijunRole {
    if (!this.state.participantIds.includes(playerId)) return 'spectator';
    return playerId === this.state.spyId ? 'spy' : 'player';
  }

  private playerInfo(room: Room, playerId: string): SpijunPlayerInfo {
    const p = room.players.find((pp) => pp.id === playerId);
    return {
      playerId,
      name: p?.name ?? '?',
      avatarColor: p?.avatarColor ?? '#888888',
    };
  }

  // --- Build state ---------------------------------------------------------

  private buildGameState(room: Room): GameState {
    const hostData = this.buildHostData(room);
    const data: Record<string, unknown> = {
      phase: this.state.phase,
      tutorialMode: this.state.tutorialMode,
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
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  /**
   * Shared data — NEVER the secret location, per-player roles, or the spy's
   * identity before spy-guess/results. Accusations are anonymous counts.
   */
  private buildHostData(room: Room): SpijunHostData {
    const hostData: SpijunHostData = {
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      locationNames: this.state.locationList.map((l) => l.location),
      players: this.state.participantIds.map((id) => this.playerInfo(room, id)),
    };

    if (this.state.phase === 'discussion') {
      hostData.accuseThreshold = this.state.accuseThreshold;
      hostData.discussionRemaining = Math.max(
        0,
        Math.ceil(this.state.phaseTimeRemaining)
      );
      const counts = new Map<string, number>();
      for (const target of this.state.accusations.values()) {
        counts.set(target, (counts.get(target) ?? 0) + 1);
      }
      hostData.accusationTally = [...counts.entries()]
        .map<SpijunAccusationTally>(([targetId, votes]) => ({
          ...this.playerInfo(room, targetId),
          targetId,
          votes,
        }))
        .sort((a, b) => b.votes - a.votes);
    }

    if (this.state.phase === 'defense' || this.state.phase === 'voting') {
      hostData.discussionRemaining = Math.max(
        0,
        Math.ceil(this.state.discussionRemaining)
      );
      if (this.state.accusedId) {
        const info = this.playerInfo(room, this.state.accusedId);
        hostData.accusedId = info.playerId;
        hostData.accusedName = info.name;
        hostData.accusedAvatarColor = info.avatarColor;
      }
    }

    if (this.state.phase === 'voting') {
      const voters = [...this.state.expectedVoterIds].filter((id) =>
        room.players.some((p) => p.id === id)
      );
      hostData.totalVoters = voters.length;
      hostData.votedCount = voters.filter((id) =>
        this.state.votes.has(id)
      ).length;
    }

    // The spy self-reveals to guess (tabletop rule) — public from here on.
    if (
      (this.state.phase === 'spy-guess' || this.state.phase === 'results') &&
      this.state.spyId
    ) {
      const info = this.playerInfo(room, this.state.spyId);
      hostData.spyId = info.playerId;
      hostData.spyName = info.name;
      hostData.spyDeclared = this.state.spyDeclared;
      if (this.state.spyDeclared) hostData.spyEarlyBonus = this.earlyGuessBonus();
    }

    if (this.state.phase === 'results' || this.state.phase === 'ended') {
      hostData.leaderboard = this.buildLeaderboard(room);
    }

    if (this.state.phase === 'results') {
      hostData.location = this.state.currentLocation?.location;
      hostData.outcome = this.state.outcome ?? undefined;
      hostData.spyGuess = this.state.spyGuess;
      hostData.voteYes = this.state.voteYes;
      hostData.voteNo = this.state.voteNo;
      if (this.state.outcome === 'spy-caught' && this.state.initiatorId) {
        hostData.initiatorName = this.playerInfo(
          room,
          this.state.initiatorId
        ).name;
      }
      hostData.results = this.buildResults(room);
    }

    return hostData;
  }

  private buildControllerData(playerId: string): SpijunControllerData {
    const role = this.roleFor(playerId);
    const pd: SpijunControllerData = { role };

    // The secret location + role go ONLY to non-spies, only while playing.
    const activePhase =
      this.state.phase === 'reveal-role' ||
      this.state.phase === 'discussion' ||
      this.state.phase === 'defense' ||
      this.state.phase === 'voting' ||
      this.state.phase === 'spy-guess';
    if (role === 'player' && activePhase) {
      pd.location = this.state.currentLocation?.location;
      pd.roleInLocation = this.state.rolesByPlayer.get(playerId);
    }

    if (this.state.phase === 'discussion') {
      pd.canAccuse = role !== 'spectator';
      pd.accusedTargetId = this.state.accusations.get(playerId) ?? null;
      // Spy only — and only in playerData, so no one else can see the option
      // exists, let alone that it is offered to exactly one phone.
      if (role === 'spy') pd.canDeclare = true;
    }

    if (this.state.phase === 'voting') {
      pd.isAccused = playerId === this.state.accusedId;
      pd.canVote = this.state.expectedVoterIds.has(playerId);
      pd.hasVoted = this.state.votes.has(playerId);
    }
    if (this.state.phase === 'defense') {
      pd.isAccused = playerId === this.state.accusedId;
    }

    if (this.state.phase === 'spy-guess' && role === 'spy') {
      pd.canGuess = true;
      pd.hasGuessed = this.state.spyGuess !== null;
    }

    if (this.state.phase === 'results') {
      pd.ownRoundScore = this.state.roundScores.get(playerId) ?? 0;
    }

    return pd;
  }

  private buildResults(room: Room): SpijunPlayerResult[] {
    return this.state.participantIds
      .map<SpijunPlayerResult>((id) => {
        const info = this.playerInfo(room, id);
        return {
          ...info,
          isSpy: id === this.state.spyId,
          roundScore: this.state.roundScores.get(id) ?? 0,
          totalScore: room.players.find((p) => p.id === id)?.score ?? 0,
        };
      })
      .sort((a, b) => b.roundScore - a.roundScore);
  }

  private buildLeaderboard(room: Room): SpijunLeaderboardEntry[] {
    return room.players
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        avatarColor: p.avatarColor,
        score: p.score,
        rank: 0,
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  }
}
