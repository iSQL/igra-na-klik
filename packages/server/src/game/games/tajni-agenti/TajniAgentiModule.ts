import type {
  Room,
  GameState,
  TajniAgentiTeam,
  TajniAgentiCardType,
  TajniAgentiDuetKey,
  TajniAgentiDuetSideType,
  TajniAgentiEndReason,
  TajniAgentiMode,
  TajniAgentiPublicCard,
  TajniAgentiSecretCard,
  TajniAgentiPublicRosters,
  TajniAgentiTurnLogEntry,
  TajniAgentiTurnResultsData,
} from '@igra/shared';
import {
  TAJNI_AGENTI_DEFAULT_BANK,
  parseTajniAgentiImport,
  TAJNI_AGENTI_BOARD_SIZE,
  TAJNI_AGENTI_NEUTRAL_CARDS,
  TAJNI_AGENTI_ASSASSIN_CARDS,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import { getGameTimings } from '../../timing-config.js';
import {
  TEAM_SELECTION_DURATION,
  CLUE_GIVING_DURATION,
  GUESSING_DURATION,
  TURN_RESULTS_DURATION,
  TAJNI_AGENTI_COOP_TURNS,
  MIN_CLUE_NUMBER,
  MAX_CLUE_NUMBER,
  MAX_CLUE_WORD_LENGTH,
} from './TajniAgentiState.js';
import type { TajniAgentiInternalState } from './TajniAgentiState.js';

interface TajniAgentiCustomContent {
  customTajniAgentiPack?: unknown;
  tajniAgentiMode?: unknown;
}

const OTHER_TEAM: Record<TajniAgentiTeam, TajniAgentiTeam> = {
  red: 'blue',
  blue: 'red',
};

// Coop mode: everyone plays as the blue team against the board; the red
// cards are the "enemy agents" that cost an extra point when revealed.
const COOP_TEAM: TajniAgentiTeam = 'blue';

/**
 * The standard Codenames: Duet key distribution over 25 cards. Per side:
 * 9 agents, 3 assassins, 13 bystanders; 15 distinct agents total (3 shared).
 */
const DUET_KEY_DISTRIBUTION: Array<[TajniAgentiDuetSideType, TajniAgentiDuetSideType, number]> = [
  ['agent', 'agent', 3],
  ['agent', 'neutral', 5],
  ['neutral', 'agent', 5],
  ['agent', 'assassin', 1],
  ['assassin', 'agent', 1],
  ['assassin', 'assassin', 1],
  ['assassin', 'neutral', 1],
  ['neutral', 'assassin', 1],
  ['neutral', 'neutral', 7],
];

const resolveMode = (raw: unknown): TajniAgentiMode =>
  raw === 'duet' || raw === 'coop' ? raw : 'classic';

export class TajniAgentiModule extends BaseGameModule {
  readonly gameId = 'tajni-agenti';

  private state!: TajniAgentiInternalState;
  private timings: Record<string, number> = {};

  validateStart(room: Room, customContent?: unknown): string | null {
    const cc = customContent as TajniAgentiCustomContent | undefined;
    const mode = resolveMode(cc?.tajniAgentiMode);
    const connected = room.players.filter((p) => p.isConnected);
    if (mode === 'classic' && connected.length < 4) {
      // Two teams, each with a spymaster + at least one guesser → floor of 4.
      return 'Klasični mod zahteva najmanje 4 igrača — za manje izaberi Duet ili Kooperativni mod.';
    }
    if (connected.length < 2) {
      return 'Tajni agenti zahteva najmanje 2 igrača.';
    }
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    this.timings = getGameTimings(this.gameId);
    const cc = customContent as TajniAgentiCustomContent | undefined;
    const mode = resolveMode(cc?.tajniAgentiMode);

    const words = this.resolveWords(cc?.customTajniAgentiPack);
    const startingTeam: TajniAgentiTeam =
      mode === 'coop' ? COOP_TEAM : Math.random() < 0.5 ? 'red' : 'blue';
    const cards =
      mode === 'duet'
        ? this.buildDuetBoard(words)
        : this.buildBoard(words, startingTeam);

    this.state = {
      phase: 'team-selection',
      phaseTimeRemaining: TEAM_SELECTION_DURATION,
      mode,
      turnsRemaining: mode === 'classic' ? 0 : TAJNI_AGENTI_COOP_TURNS,
      // Scenario mode was removed — always false.
      isScenarioMode: false,
      cards,
      teams: { red: [], blue: [] },
      spymasters: { red: null, blue: null },
      currentTeam: startingTeam,
      startingTeam,
      currentClue: null,
      guessesRemaining: 0,
      turnLog: [],
      expectedGuesserIds: new Set(),
      expectedSpymasterId: null,
      lastTurnResults: null,
      gameOver: false,
      winner: null,
      winReason: null,
    };

    // Coop: no team picking — everyone is on the one team from the start;
    // team-selection is only used to (optionally) claim the spymaster role.
    if (mode === 'coop') {
      this.state.teams[COOP_TEAM] = room.players
        .filter((p) => p.isConnected)
        .map((p) => p.id);
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
      case 'tajni-agenti:pick-team':
        return this.handlePickTeam(room, playerId, data);
      case 'tajni-agenti:toggle-spymaster':
        return this.handleToggleSpymaster(room, playerId);
      case 'tajni-agenti:submit-clue':
        return this.handleSubmitClue(room, playerId, data);
      case 'tajni-agenti:guess-card':
        return this.handleGuessCard(room, playerId, data);
      case 'tajni-agenti:end-turn':
        return this.handleEndTurn(room, playerId);
      default:
        return null;
    }
  }

  onHostAction(
    room: Room,
    _gameState: GameState,
    action: string,
    _data: Record<string, unknown>
  ): GameState | null {
    switch (action) {
      case 'tajni-agenti:auto-balance':
        if (this.state.phase !== 'team-selection') return null;
        this.autoBalanceTeams(room);
        return this.buildGameState(room);
      case 'tajni-agenti:start-round':
        if (this.state.phase !== 'team-selection') return null;
        if (this.evaluateRosters(room).rosterIssue !== null) return null;
        this.beginPlay(room);
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
    // Past-grace removal — clean up team rosters and snapshots.
    this.removePlayerFromRosters(playerId);
    this.state.expectedGuesserIds.delete(playerId);

    if (this.state.phase === 'team-selection' || this.state.phase === 'ended') {
      return this.buildGameState(room);
    }

    if (this.state.mode === 'duet') {
      // Both sides must stay populated — each gives clues to the other.
      if (
        this.state.teams.red.length === 0 ||
        this.state.teams.blue.length === 0
      ) {
        this.endGame(null, 'abandoned', true);
      }
      return this.buildGameState(room);
    }

    if (this.state.mode === 'coop') {
      const roster = this.state.teams[COOP_TEAM];
      if (roster.length < 2) {
        // A lone player can't be both spymaster and guesser.
        this.endGame(null, 'abandoned', true);
        return this.buildGameState(room);
      }
      if (this.state.spymasters[COOP_TEAM] === null) {
        // The spymaster left — promote a random remaining player.
        const next = roster[Math.floor(Math.random() * roster.length)];
        this.state.spymasters[COOP_TEAM] = next;
        this.state.expectedGuesserIds.delete(next);
        if (this.state.phase === 'clue-giving') {
          this.state.phaseTimeRemaining = CLUE_GIVING_DURATION;
          this.state.expectedSpymasterId = next;
        }
      }
      return this.buildGameState(room);
    }

    // Classic: if the leaving player was the current spymaster, promote a
    // teammate or hand the win to the other team if the team is empty.
    for (const team of ['red', 'blue'] as const) {
      if (this.state.spymasters[team] === playerId) {
        const teammates = this.state.teams[team];
        if (teammates.length === 0) {
          this.endGame(OTHER_TEAM[team], 'opponent-finished', true);
          return this.buildGameState(room);
        }
        const next = teammates[Math.floor(Math.random() * teammates.length)];
        this.state.spymasters[team] = next;
        this.state.teams[team] = teammates.filter((id) => id !== next);
        this.state.teams[team].push(next);
        if (
          this.state.phase === 'clue-giving' &&
          this.state.currentTeam === team
        ) {
          // Reset the clue-giving timer so the new spymaster gets a fair shot.
          this.state.phaseTimeRemaining = CLUE_GIVING_DURATION;
          this.state.expectedSpymasterId = next;
        }
      }
    }

    // If a team is now completely empty, the other team wins.
    if (
      !this.state.gameOver &&
      (this.state.teams.red.length === 0 ||
        this.state.teams.blue.length === 0)
    ) {
      const emptyTeam =
        this.state.teams.red.length === 0 ? 'red' : 'blue';
      this.endGame(OTHER_TEAM[emptyTeam], 'opponent-finished', true);
    }

    return this.buildGameState(room);
  }

  // ----------------------------------------------------------------- helpers

  private resolveWords(custom: unknown): readonly string[] {
    if (custom !== undefined) {
      const parsed = parseTajniAgentiImport(custom);
      if (parsed.ok) return parsed.pack.words;
    }
    // Dedupe defensively — the default bank is author-curated but may
    // contain a few overlaps across category groupings.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const w of TAJNI_AGENTI_DEFAULT_BANK) {
      const key = w.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w.trim());
    }
    return out;
  }

  private pickWords(sourceWords: readonly string[]): string[] {
    const pool = [...sourceWords];
    // Fisher-Yates partial shuffle to pick 25.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, TAJNI_AGENTI_BOARD_SIZE);
  }

  private buildBoard(
    sourceWords: readonly string[],
    startingTeam: TajniAgentiTeam
  ): TajniAgentiSecretCard[] {
    const chosen = this.pickWords(sourceWords);

    const startingCount = 9;
    const otherCount = 8;
    const otherTeam = OTHER_TEAM[startingTeam];

    const types: TajniAgentiCardType[] = [
      ...Array<TajniAgentiCardType>(startingCount).fill(startingTeam),
      ...Array<TajniAgentiCardType>(otherCount).fill(otherTeam),
      ...Array<TajniAgentiCardType>(TAJNI_AGENTI_NEUTRAL_CARDS).fill('neutral'),
      ...Array<TajniAgentiCardType>(TAJNI_AGENTI_ASSASSIN_CARDS).fill('assassin'),
    ];
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }

    return chosen.map((word, idx) => ({
      id: idx,
      word,
      type: types[idx],
      revealed: false,
    }));
  }

  private buildDuetBoard(sourceWords: readonly string[]): TajniAgentiSecretCard[] {
    const chosen = this.pickWords(sourceWords);

    const keys: TajniAgentiDuetKey[] = [];
    for (const [red, blue, count] of DUET_KEY_DISTRIBUTION) {
      for (let i = 0; i < count; i++) keys.push({ red, blue });
    }
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }

    // `type` is a placeholder until reveal — duet reveals set it to
    // 'agent' or 'assassin' based on the clue-giving side's key.
    return chosen.map((word, idx) => ({
      id: idx,
      word,
      type: 'neutral' as TajniAgentiCardType,
      revealed: false,
      duet: keys[idx],
    }));
  }

  private duetAgentsTotal(): number {
    return this.state.cards.filter(
      (c) => c.duet && (c.duet.red === 'agent' || c.duet.blue === 'agent')
    ).length;
  }

  private duetAgentsFound(): number {
    return this.state.cards.filter(
      (c) => c.revealed && c.type === 'agent'
    ).length;
  }

  private removePlayerFromRosters(playerId: string): void {
    for (const team of ['red', 'blue'] as const) {
      this.state.teams[team] = this.state.teams[team].filter(
        (id) => id !== playerId
      );
      if (this.state.spymasters[team] === playerId) {
        this.state.spymasters[team] = null;
      }
    }
  }

  /**
   * After any team membership shuffle, drop spymaster claims that no
   * longer point at a player on the same team — e.g. the auto-balance
   * shuffle moves a claimant to the other side.
   */
  private auditSpymasters(): void {
    for (const team of ['red', 'blue'] as const) {
      const sid = this.state.spymasters[team];
      if (sid && !this.state.teams[team].includes(sid)) {
        this.state.spymasters[team] = null;
      }
    }
  }

  private handlePickTeam(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'team-selection') return null;
    // Coop: a single fixed team — nothing to pick.
    if (this.state.mode === 'coop') return null;
    if (!room.players.some((p) => p.id === playerId)) return null;

    const team = data.team as TajniAgentiTeam | null | undefined;
    if (team !== 'red' && team !== 'blue' && team !== null) return null;

    this.removePlayerFromRosters(playerId);
    if (team === 'red' || team === 'blue') {
      this.state.teams[team].push(playerId);
    }
    return this.buildGameState(room);
  }

  private handleToggleSpymaster(room: Room, playerId: string): GameState | null {
    if (this.state.phase !== 'team-selection') return null;
    // Duet has no spymaster role — everyone on a side both gives clues and
    // guesses. Silently ignore stale controller taps.
    if (this.state.mode === 'duet') return null;
    if (!room.players.some((p) => p.id === playerId)) return null;

    const team = this.playerTeam(playerId);
    if (team === null) return null;

    const current = this.state.spymasters[team];
    if (current === playerId) {
      // Player is releasing their own claim.
      this.state.spymasters[team] = null;
    } else if (current === null) {
      // Slot is open — claim it.
      this.state.spymasters[team] = playerId;
    } else {
      // Someone else already claimed — silently reject so the
      // controller's local state doesn't drift on a fast double-tap.
      return null;
    }
    return this.buildGameState(room);
  }

  private autoBalanceTeams(room: Room): void {
    const connected = room.players
      .filter((p) => p.isConnected)
      .map((p) => p.id);
    const assigned = new Set([
      ...this.state.teams.red,
      ...this.state.teams.blue,
    ]);
    const unassigned = connected.filter((id) => !assigned.has(id));

    if (this.state.mode === 'coop') {
      // One team — just sweep everyone in.
      this.state.teams[COOP_TEAM].push(...unassigned);
      return;
    }

    // Shuffle unassigned, then balance towards the smaller team.
    for (let i = unassigned.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unassigned[i], unassigned[j]] = [unassigned[j], unassigned[i]];
    }
    for (const id of unassigned) {
      const target =
        this.state.teams.red.length <= this.state.teams.blue.length
          ? 'red'
          : 'blue';
      this.state.teams[target].push(id);
    }

    // Then rebalance if existing rosters are still too lopsided.
    while (
      Math.abs(this.state.teams.red.length - this.state.teams.blue.length) > 1
    ) {
      const fromTeam: TajniAgentiTeam =
        this.state.teams.red.length > this.state.teams.blue.length
          ? 'red'
          : 'blue';
      const toTeam: TajniAgentiTeam = OTHER_TEAM[fromTeam];
      // Prefer to move someone who didn't claim spymaster — keeps the
      // existing role assignments stable when possible.
      const candidates = this.state.teams[fromTeam];
      const idx = candidates.findIndex(
        (id) => this.state.spymasters[fromTeam] !== id
      );
      const moveIdx = idx >= 0 ? idx : candidates.length - 1;
      const moved = candidates.splice(moveIdx, 1)[0];
      this.state.teams[toTeam].push(moved);
    }

    // Drop spymaster claims that no longer match team membership.
    this.auditSpymasters();
  }

  private evaluateRosters(room: Room): TajniAgentiPublicRosters {
    const connectedIds = new Set(
      room.players.filter((p) => p.isConnected).map((p) => p.id)
    );
    const assigned = new Set([
      ...this.state.teams.red,
      ...this.state.teams.blue,
    ]);
    const unassigned = [...connectedIds].filter((id) => !assigned.has(id));

    let rosterIssue: string | null = null;
    if (this.state.mode === 'coop') {
      if (this.state.teams[COOP_TEAM].length < 2) {
        rosterIssue = 'Potrebna su najmanje 2 igrača (špijun + pogađač).';
      }
    } else {
      // Duet sides work from a single player (everyone on a side both
      // gives clues and guesses); classic needs ≥2 per team so there's a
      // spymaster AND at least one guesser.
      const minPerTeam = this.state.mode === 'duet' ? 1 : 2;
      if (this.state.teams.red.length < minPerTeam) {
        rosterIssue = `Crveni tim mora imati najmanje ${minPerTeam} igrača.`;
      } else if (this.state.teams.blue.length < minPerTeam) {
        rosterIssue = `Plavi tim mora imati najmanje ${minPerTeam} igrača.`;
      } else if (
        Math.abs(this.state.teams.red.length - this.state.teams.blue.length) > 1
      ) {
        rosterIssue = 'Razlika između timova ne sme biti veća od 1 igrača.';
      } else if (unassigned.length > 0) {
        rosterIssue = 'Svi igrači moraju izabrati tim.';
      }
    }

    return {
      red: {
        playerIds: [...this.state.teams.red],
        spymasterId: this.state.spymasters.red,
      },
      blue: {
        playerIds: [...this.state.teams.blue],
        spymasterId: this.state.spymasters.blue,
      },
      unassignedPlayerIds: unassigned,
      readyToStart: rosterIssue === null,
      rosterIssue,
    };
  }

  /**
   * Resolve each team's spymaster: respect an existing claim if there is
   * one, otherwise fall back to a random teammate so the game can still
   * start when nobody volunteered.
   */
  private resolveSpymaster(team: TajniAgentiTeam): string | null {
    const claimed = this.state.spymasters[team];
    if (claimed && this.state.teams[team].includes(claimed)) {
      return claimed;
    }
    const roster = this.state.teams[team];
    if (roster.length === 0) return null;
    return roster[Math.floor(Math.random() * roster.length)];
  }

  private beginPlay(room: Room): void {
    void room;
    if (this.state.mode === 'duet') {
      // No spymaster role — the whole giving side knows its key.
      this.state.spymasters.red = null;
      this.state.spymasters.blue = null;
    } else if (this.state.mode === 'coop') {
      this.state.spymasters[COOP_TEAM] = this.resolveSpymaster(COOP_TEAM);
      this.state.spymasters[OTHER_TEAM[COOP_TEAM]] = null;
    } else {
      this.state.spymasters.red = this.resolveSpymaster('red');
      this.state.spymasters.blue = this.resolveSpymaster('blue');
    }
    this.beginClueGiving();
  }

  private beginClueGiving(): void {
    this.state.phase = 'clue-giving';
    this.state.phaseTimeRemaining = CLUE_GIVING_DURATION;
    this.state.currentClue = null;
    this.state.expectedSpymasterId =
      this.state.mode === 'duet'
        ? null
        : this.state.spymasters[this.state.currentTeam];
  }

  private handleSubmitClue(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'clue-giving') return null;
    if (this.state.mode === 'duet') {
      // Any member of the giving side may submit — first clue wins.
      if (!this.state.teams[this.state.currentTeam].includes(playerId)) {
        return null;
      }
    } else if (this.state.spymasters[this.state.currentTeam] !== playerId) {
      return null;
    }

    const rawWord = data.word;
    const rawCount = data.count;
    if (typeof rawWord !== 'string') return null;
    if (typeof rawCount !== 'number' || !Number.isInteger(rawCount)) return null;
    const word = rawWord.trim();
    if (word.length === 0 || word.length > MAX_CLUE_WORD_LENGTH) return null;
    // Single word — reject anything with whitespace.
    if (/\s/.test(word)) return null;
    if (rawCount < MIN_CLUE_NUMBER || rawCount > MAX_CLUE_NUMBER) return null;

    this.state.currentClue = {
      word,
      count: rawCount,
      team: this.state.currentTeam,
    };
    this.beginGuessing(room);
    return this.buildGameState(room);
  }

  /** The side that taps cards this turn. Duet: the OTHER side guesses the
   * giver's clue; classic/coop: the giving team's own guessers. */
  private guessingSide(): TajniAgentiTeam {
    return this.state.mode === 'duet'
      ? OTHER_TEAM[this.state.currentTeam]
      : this.state.currentTeam;
  }

  private beginGuessing(room: Room): void {
    const side = this.guessingSide();
    const spymasterId = this.state.spymasters[side];
    this.state.expectedGuesserIds = new Set(
      this.state.mode === 'duet'
        ? this.state.teams[side]
        : this.state.teams[side].filter((id) => id !== spymasterId)
    );
    // Classic Codenames rule in every mode: count + 1 guesses.
    this.state.guessesRemaining = (this.state.currentClue?.count ?? 0) + 1;
    this.state.turnLog = [];
    this.state.phase = 'guessing';
    this.state.phaseTimeRemaining = GUESSING_DURATION;
    void room;
  }

  private canGuess(playerId: string): boolean {
    const side = this.guessingSide();
    if (!this.state.teams[side].includes(playerId)) return false;
    // Classic/coop: the spymaster already sees the colours.
    if (
      this.state.mode !== 'duet' &&
      this.state.spymasters[side] === playerId
    ) {
      return false;
    }
    return true;
  }

  private handleGuessCard(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'guessing') return null;
    if (!this.canGuess(playerId)) return null;

    const rawId = data.cardId;
    if (typeof rawId !== 'number' || !Number.isInteger(rawId)) return null;
    const card = this.state.cards.find((c) => c.id === rawId);
    if (!card || card.revealed) return null;

    if (this.state.mode === 'duet') {
      return this.adjudicateDuetGuess(room, playerId, card);
    }

    card.revealed = true;
    this.logGuess(room, playerId, card, card.type);

    const team = this.state.currentTeam;
    const teamColor: TajniAgentiCardType = team;
    if (card.type === 'assassin') {
      this.endTurnWith('assassin', room);
      if (this.state.mode === 'coop') {
        this.endGame(null, 'assassin');
      } else {
        this.endGame(OTHER_TEAM[team], 'assassin');
      }
      return this.buildGameState(room);
    }

    if (card.type === teamColor) {
      // Correct guess — check for win.
      if (this.teamRemaining(teamColor) === 0) {
        this.endTurnWith('count-reached', room);
        this.endGame(this.state.mode === 'coop' ? 'players' : team, 'all-found');
        return this.buildGameState(room);
      }
      this.state.guessesRemaining--;
      if (this.state.guessesRemaining <= 0) {
        this.endTurnWith('count-reached', room);
        return this.buildGameState(room);
      }
      return this.buildGameState(room);
    }

    if (card.type === 'neutral') {
      this.endTurnWith('neutral', room);
      return this.buildGameState(room);
    }

    // Enemy-coloured card revealed.
    if (this.state.mode === 'coop') {
      // Coop: the enemy card costs one EXTRA point on top of the turn's
      // base cost (applied in endTurnWith).
      this.state.turnsRemaining--;
      this.endTurnWith('wrong-team', room);
      return this.buildGameState(room);
    }

    const opp = OTHER_TEAM[team];
    if (this.teamRemaining(opp) === 0) {
      this.endTurnWith('wrong-team', room);
      this.endGame(opp, 'opponent-finished');
      return this.buildGameState(room);
    }
    this.endTurnWith('wrong-team', room);
    return this.buildGameState(room);
  }

  /**
   * Duet: guesses are adjudicated against the CLUE GIVER's side of the key
   * (currentTeam). Agents are covered for good; bystanders only mark the
   * card as dead-for-that-side (it may still be an agent on the other side);
   * an assassin on the giver's side loses the game for both.
   */
  private adjudicateDuetGuess(
    room: Room,
    playerId: string,
    card: TajniAgentiSecretCard
  ): GameState | null {
    const giver = this.state.currentTeam;
    if (card.bystanderFor?.includes(giver)) return null;
    const key = card.duet![giver];

    if (key === 'assassin') {
      card.revealed = true;
      card.type = 'assassin';
      this.logGuess(room, playerId, card, 'assassin');
      this.endTurnWith('assassin', room);
      this.endGame(null, 'assassin');
      return this.buildGameState(room);
    }

    if (key === 'agent') {
      card.revealed = true;
      card.type = 'agent';
      this.logGuess(room, playerId, card, 'agent');
      if (this.duetAgentsFound() === this.duetAgentsTotal()) {
        this.endTurnWith('count-reached', room);
        this.endGame('players', 'all-found');
        return this.buildGameState(room);
      }
      this.state.guessesRemaining--;
      if (this.state.guessesRemaining <= 0) {
        this.endTurnWith('count-reached', room);
      }
      return this.buildGameState(room);
    }

    // Bystander on the giver's side — mark and end the turn.
    card.bystanderFor = [...(card.bystanderFor ?? []), giver];
    this.logGuess(room, playerId, card, 'neutral');
    this.endTurnWith('neutral', room);
    return this.buildGameState(room);
  }

  private logGuess(
    room: Room,
    playerId: string,
    card: TajniAgentiSecretCard,
    revealedType: TajniAgentiCardType
  ): void {
    const guesser = room.players.find((p) => p.id === playerId);
    this.state.turnLog.push({
      cardId: card.id,
      word: card.word,
      revealedType,
      guesserId: playerId,
      guesserName: guesser?.name ?? '?',
    });
  }

  private handleEndTurn(room: Room, playerId: string): GameState | null {
    if (this.state.phase !== 'guessing') return null;
    if (!this.canGuess(playerId)) return null;
    this.endTurnWith('ended-early', room);
    return this.buildGameState(room);
  }

  private teamRemaining(color: TajniAgentiCardType): number {
    return this.state.cards.filter(
      (c) => c.type === color && !c.revealed
    ).length;
  }

  private endTurnWith(
    reason: TajniAgentiTurnResultsData['endReason'],
    _room: Room
  ): void {
    const team = this.state.currentTeam;
    // Classic and duet alternate sides; coop is always the one team.
    const nextTeam =
      this.state.mode === 'coop' ? team : OTHER_TEAM[team];

    // Duet/coop: every turn consumes one of the 9 shared turns/points.
    if (this.state.mode !== 'classic') {
      this.state.turnsRemaining--;
    }

    this.state.lastTurnResults = {
      team,
      clue: this.state.currentClue,
      log: [...this.state.turnLog],
      endReason: reason,
      nextTeam,
      turnsRemaining:
        this.state.mode === 'classic'
          ? undefined
          : Math.max(0, this.state.turnsRemaining),
    };
    this.state.currentTeam = nextTeam;
    this.state.phase = 'turn-results';
    this.state.phaseTimeRemaining =
      this.timings.TURN_RESULTS_DURATION ?? TURN_RESULTS_DURATION;

    // Budget exhausted with agents still hidden → cooperative loss.
    if (
      this.state.mode !== 'classic' &&
      !this.state.gameOver &&
      this.state.turnsRemaining <= 0
    ) {
      this.endGame(null, 'out-of-turns');
    }
  }

  /**
   * Decide the game. Classic: `winner` is a team. Duet/coop: 'players' on
   * a win, null on a loss. `immediate` skips the turn-results beat and
   * jumps straight to the ended phase (disconnect-driven endings).
   */
  private endGame(
    winner: TajniAgentiTeam | 'players' | null,
    reason: TajniAgentiEndReason,
    immediate = false
  ): void {
    if (this.state.gameOver) return;
    this.state.gameOver = true;
    this.state.winner = winner;
    this.state.winReason = reason;
    // Overwrite the just-set turn-results to ensure post-turn-results
    // we jump to the ended phase rather than another clue-giving, and to
    // announce the outcome on the turn-results screen (the phones' final
    // notice overlay would otherwise cover the ended screen instantly).
    if (this.state.lastTurnResults) {
      this.state.lastTurnResults.nextTeam = null;
      this.state.lastTurnResults.winner = winner;
    }
    if (immediate) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
    }
  }

  private advanceOnTimeout(room: Room): void {
    switch (this.state.phase) {
      case 'team-selection': {
        // Auto-balance + auto-start if rosters resolvable.
        this.autoBalanceTeams(room);
        if (this.evaluateRosters(room).rosterIssue === null) {
          this.beginPlay(room);
        } else {
          // Not enough connected players to form valid teams — end.
          this.state.phase = 'ended';
          this.state.phaseTimeRemaining = 0;
        }
        break;
      }
      case 'clue-giving': {
        // Clue never arrived — the turn is forfeit (in duet/coop this
        // still consumes one of the 9 turns, so stalling isn't free).
        this.endTurnWith('timeout', room);
        break;
      }
      case 'guessing': {
        this.endTurnWith('timeout', room);
        break;
      }
      case 'turn-results': {
        if (this.state.gameOver) {
          this.state.phase = 'ended';
          this.state.phaseTimeRemaining = 0;
        } else {
          this.beginClueGiving();
        }
        break;
      }
      case 'ended':
        break;
    }
  }

  // -------------------------------------------------------- buildGameState

  private toPublicCard(card: TajniAgentiSecretCard): TajniAgentiPublicCard {
    const pub: TajniAgentiPublicCard = card.revealed
      ? { id: card.id, word: card.word, revealed: true, type: card.type }
      : { id: card.id, word: card.word, revealed: false };
    if (card.bystanderFor && card.bystanderFor.length > 0) {
      pub.bystanderFor = [...card.bystanderFor];
    }
    return pub;
  }

  /** Duet: a player's view of their own side of the key. */
  private duetSideView(side: TajniAgentiTeam): TajniAgentiSecretCard[] {
    return this.state.cards.map((c) => ({
      id: c.id,
      word: c.word,
      type: (c.duet![side] === 'agent'
        ? 'agent'
        : c.duet![side]) as TajniAgentiCardType,
      revealed: c.revealed,
      bystanderFor: c.bystanderFor ? [...c.bystanderFor] : undefined,
    }));
  }

  private buildGameState(room: Room): GameState {
    const phase = this.state.phase;
    const mode = this.state.mode;
    const publicCards = this.state.cards.map((c) => this.toPublicCard(c));
    const redRemaining = this.teamRemaining('red');
    const blueRemaining = this.teamRemaining('blue');
    const agentsTotal =
      mode === 'duet' ? this.duetAgentsTotal() : mode === 'coop' ? 9 : 0;
    const agentsFound =
      mode === 'duet'
        ? this.duetAgentsFound()
        : mode === 'coop'
          ? agentsTotal - this.teamRemaining(COOP_TEAM)
          : 0;

    const data: Record<string, unknown> = {
      phase,
      mode,
      cards: publicCards,
      currentTeam: this.state.currentTeam,
      startingTeam: this.state.startingTeam,
      isScenarioMode: this.state.isScenarioMode,
      redRemaining,
      blueRemaining,
      redTeam: {
        playerIds: [...this.state.teams.red],
        spymasterId: this.state.spymasters.red,
      },
      blueTeam: {
        playerIds: [...this.state.teams.blue],
        spymasterId: this.state.spymasters.blue,
      },
    };

    if (mode !== 'classic') {
      data.turnsRemaining = Math.max(0, this.state.turnsRemaining);
      data.agentsFound = agentsFound;
      data.agentsTotal = agentsTotal;
    }

    if (phase === 'team-selection') {
      data.rosters = this.evaluateRosters(room);
    } else if (phase === 'clue-giving') {
      data.guessesRemaining = this.state.guessesRemaining;
    } else if (phase === 'guessing') {
      data.currentClue = this.state.currentClue;
      data.guessesRemaining = this.state.guessesRemaining;
      data.turnLog = [...this.state.turnLog] satisfies TajniAgentiTurnLogEntry[];
    } else if (phase === 'turn-results') {
      data.turnResults = this.state.lastTurnResults;
      data.guessesRemaining = this.state.guessesRemaining;
    } else if (phase === 'ended') {
      data.ended = {
        winner: this.state.winner,
        reason: this.state.winReason,
        redRemaining,
        blueRemaining,
        agentsFound: mode === 'classic' ? undefined : agentsFound,
        agentsTotal: mode === 'classic' ? undefined : agentsTotal,
      };
    }

    // Per-player view: team membership + the player's secret board slice.
    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const team = this.playerTeam(player.id);
      let isSpymaster: boolean;
      let isCurrentSpymaster: boolean;
      let isCurrentGuesser: boolean;
      if (mode === 'duet') {
        // Everyone always sees their own side of the key ("spymaster"),
        // gives clues when their side is up, and guesses the other side's.
        isSpymaster = team !== null;
        isCurrentSpymaster = team !== null && this.state.currentTeam === team;
        isCurrentGuesser =
          team !== null && this.guessingSide() === team && !isCurrentSpymaster;
      } else {
        isSpymaster =
          team !== null && this.state.spymasters[team] === player.id;
        isCurrentSpymaster =
          isSpymaster && this.state.currentTeam === team;
        isCurrentGuesser =
          team !== null &&
          this.state.currentTeam === team &&
          !isSpymaster;
      }
      const myData: Record<string, unknown> = {
        team,
        isSpymaster,
        isCurrentSpymaster,
        isCurrentGuesser,
      };
      if (isSpymaster && team !== null) {
        // Send the secret board view so they can see all colours.
        myData.secretCards =
          mode === 'duet'
            ? this.duetSideView(team)
            : this.state.cards.map((c) => ({
                id: c.id,
                word: c.word,
                type: c.type,
                revealed: c.revealed,
              }));
      }
      playerData[player.id] = myData;
    }

    return {
      gameId: this.gameId,
      phase,
      round: 1,
      totalRounds: 1,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  private playerTeam(playerId: string): TajniAgentiTeam | null {
    if (this.state.teams.red.includes(playerId)) return 'red';
    if (this.state.teams.blue.includes(playerId)) return 'blue';
    return null;
  }
}
