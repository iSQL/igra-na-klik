import type {
  Room,
  GameState,
  TajniAgentiTeam,
  TajniAgentiCardType,
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
  findTajniAgentiScenarioByCode,
} from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import {
  TEAM_SELECTION_DURATION,
  CLUE_GIVING_DURATION,
  GUESSING_DURATION,
  TURN_RESULTS_DURATION,
  MIN_CLUE_NUMBER,
  MAX_CLUE_NUMBER,
  MAX_CLUE_WORD_LENGTH,
} from './TajniAgentiState.js';
import type { TajniAgentiInternalState } from './TajniAgentiState.js';

interface TajniAgentiCustomContent {
  customTajniAgentiPack?: unknown;
  tajniAgentiScenarioCode?: unknown;
}

const OTHER_TEAM: Record<TajniAgentiTeam, TajniAgentiTeam> = {
  red: 'blue',
  blue: 'red',
};

export class TajniAgentiModule extends BaseGameModule {
  readonly gameId = 'tajni-agenti';

  private state!: TajniAgentiInternalState;

  validateStart(room: Room): string | null {
    const connected = room.players.filter((p) => p.isConnected);
    if (connected.length < 4) {
      return 'Tajni agenti zahteva najmanje 4 igrača.';
    }
    return null;
  }

  onStart(room: Room, customContent?: unknown): GameState {
    const cc = customContent as TajniAgentiCustomContent | undefined;

    // Hidden scenario code takes precedence over the word-pack flow — it
    // pins a specific board (words + colour assignments) so a host can
    // replay or share a known layout.
    let cards: TajniAgentiSecretCard[];
    let startingTeam: TajniAgentiTeam;
    const scenario =
      typeof cc?.tajniAgentiScenarioCode === 'string'
        ? findTajniAgentiScenarioByCode(cc.tajniAgentiScenarioCode)
        : null;
    if (scenario) {
      startingTeam = scenario.startingTeam;
      cards = scenario.cards.map((c, idx) => ({
        id: idx,
        word: c.word,
        type: c.type,
        revealed: false,
      }));
    } else {
      const words = this.resolveWords(cc?.customTajniAgentiPack);
      startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
      cards = this.buildBoard(words, startingTeam);
    }

    this.state = {
      phase: 'team-selection',
      phaseTimeRemaining: TEAM_SELECTION_DURATION,
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
      winner: null,
      winReason: null,
    };

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

    if (this.state.phase === 'team-selection') {
      return this.buildGameState(room);
    }

    // If the leaving player was the current spymaster, promote a
    // teammate or hand the win to the other team if the team is empty.
    for (const team of ['red', 'blue'] as const) {
      if (this.state.spymasters[team] === playerId) {
        const teammates = this.state.teams[team];
        if (teammates.length === 0) {
          this.endGameWithWinner(OTHER_TEAM[team], 'opponent-finished');
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
      this.state.phase !== 'ended' &&
      (this.state.teams.red.length === 0 ||
        this.state.teams.blue.length === 0)
    ) {
      const emptyTeam =
        this.state.teams.red.length === 0 ? 'red' : 'blue';
      this.endGameWithWinner(OTHER_TEAM[emptyTeam], 'opponent-finished');
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

  private buildBoard(
    sourceWords: readonly string[],
    startingTeam: TajniAgentiTeam
  ): TajniAgentiSecretCard[] {
    const pool = [...sourceWords];
    // Fisher-Yates partial shuffle to pick 25.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const chosen = pool.slice(0, TAJNI_AGENTI_BOARD_SIZE);

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
    if (this.state.teams.red.length < 2) {
      rosterIssue = 'Crveni tim mora imati najmanje 2 igrača.';
    } else if (this.state.teams.blue.length < 2) {
      rosterIssue = 'Plavi tim mora imati najmanje 2 igrača.';
    } else if (
      Math.abs(this.state.teams.red.length - this.state.teams.blue.length) > 1
    ) {
      rosterIssue = 'Razlika između timova ne sme biti veća od 1 igrača.';
    } else if (unassigned.length > 0) {
      rosterIssue = 'Svi igrači moraju izabrati tim.';
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

  private beginPlay(_room: Room): void {
    this.state.spymasters.red = this.resolveSpymaster('red');
    this.state.spymasters.blue = this.resolveSpymaster('blue');
    this.beginClueGiving();
  }

  private beginClueGiving(): void {
    this.state.phase = 'clue-giving';
    this.state.phaseTimeRemaining = CLUE_GIVING_DURATION;
    this.state.currentClue = null;
    this.state.expectedSpymasterId = this.state.spymasters[this.state.currentTeam];
  }

  private handleSubmitClue(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'clue-giving') return null;
    if (this.state.spymasters[this.state.currentTeam] !== playerId) return null;

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

  private beginGuessing(room: Room): void {
    const team = this.state.currentTeam;
    const spymasterId = this.state.spymasters[team];
    this.state.expectedGuesserIds = new Set(
      this.state.teams[team].filter((id) => id !== spymasterId)
    );
    // Classic Codenames: guessers can make count + 1 guesses.
    this.state.guessesRemaining = (this.state.currentClue?.count ?? 0) + 1;
    this.state.turnLog = [];
    this.state.phase = 'guessing';
    this.state.phaseTimeRemaining = GUESSING_DURATION;
    // Silence unused param: room is referenced indirectly via teams.
    void room;
  }

  private handleGuessCard(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'guessing') return null;
    const team = this.state.currentTeam;
    // Only active-team non-spymaster players can guess.
    if (!this.state.teams[team].includes(playerId)) return null;
    if (this.state.spymasters[team] === playerId) return null;

    const rawId = data.cardId;
    if (typeof rawId !== 'number' || !Number.isInteger(rawId)) return null;
    const card = this.state.cards.find((c) => c.id === rawId);
    if (!card || card.revealed) return null;

    card.revealed = true;
    const guesser = room.players.find((p) => p.id === playerId);
    this.state.turnLog.push({
      cardId: card.id,
      word: card.word,
      revealedType: card.type,
      guesserId: playerId,
      guesserName: guesser?.name ?? '?',
    });

    // Adjudicate the reveal.
    const teamColor: TajniAgentiCardType = team;
    if (card.type === 'assassin') {
      this.endTurnWith('assassin', room);
      this.endGameWithWinner(OTHER_TEAM[team], 'assassin');
      return this.buildGameState(room);
    }

    if (card.type === teamColor) {
      // Correct guess — check for win.
      if (this.teamRemaining(teamColor) === 0) {
        this.endTurnWith('count-reached', room);
        this.endGameWithWinner(team, 'all-found');
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

    // Opposing team's card revealed.
    const opp = OTHER_TEAM[team];
    if (this.teamRemaining(opp) === 0) {
      this.endTurnWith('wrong-team', room);
      this.endGameWithWinner(opp, 'opponent-finished');
      return this.buildGameState(room);
    }
    this.endTurnWith('wrong-team', room);
    return this.buildGameState(room);
  }

  private handleEndTurn(room: Room, playerId: string): GameState | null {
    if (this.state.phase !== 'guessing') return null;
    const team = this.state.currentTeam;
    if (!this.state.teams[team].includes(playerId)) return null;
    if (this.state.spymasters[team] === playerId) return null;
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
    const nextTeam = OTHER_TEAM[team];
    this.state.lastTurnResults = {
      team,
      clue: this.state.currentClue,
      log: [...this.state.turnLog],
      endReason: reason,
      nextTeam,
    };
    this.state.currentTeam = nextTeam;
    this.state.phase = 'turn-results';
    this.state.phaseTimeRemaining = TURN_RESULTS_DURATION;
  }

  private endGameWithWinner(
    winner: TajniAgentiTeam,
    reason: 'all-found' | 'assassin' | 'opponent-finished'
  ): void {
    this.state.winner = winner;
    this.state.winReason = reason;
    // Overwrite the just-set turn-results to ensure post-turn-results
    // we jump to the ended phase rather than another clue-giving.
    if (this.state.lastTurnResults) {
      this.state.lastTurnResults.nextTeam = null;
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
        // Spymaster didn't submit in time — flip turn.
        this.endTurnWith('timeout', room);
        break;
      }
      case 'guessing': {
        this.endTurnWith('timeout', room);
        break;
      }
      case 'turn-results': {
        if (this.state.winner) {
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
    if (card.revealed) {
      return {
        id: card.id,
        word: card.word,
        revealed: true,
        type: card.type,
      };
    }
    return { id: card.id, word: card.word, revealed: false };
  }

  private buildGameState(room: Room): GameState {
    const phase = this.state.phase;
    const publicCards = this.state.cards.map((c) => this.toPublicCard(c));
    const redRemaining = this.teamRemaining('red');
    const blueRemaining = this.teamRemaining('blue');

    const data: Record<string, unknown> = {
      phase,
      cards: publicCards,
      currentTeam: this.state.currentTeam,
      startingTeam: this.state.startingTeam,
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
      };
    }

    // Per-player view: team membership + spymaster's secret board.
    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const team = this.playerTeam(player.id);
      const isSpymaster =
        team !== null && this.state.spymasters[team] === player.id;
      const isCurrentSpymaster =
        isSpymaster && this.state.currentTeam === team;
      const isCurrentGuesser =
        team !== null &&
        this.state.currentTeam === team &&
        !isSpymaster;
      const myData: Record<string, unknown> = {
        team,
        isSpymaster,
        isCurrentSpymaster,
        isCurrentGuesser,
      };
      if (isSpymaster) {
        // Send the secret board view so they can see all colours.
        myData.secretCards = this.state.cards.map((c) => ({
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
