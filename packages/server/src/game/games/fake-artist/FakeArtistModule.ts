import type {
  Room,
  GameState,
  FakeArtistControllerData,
  FakeArtistHostData,
  FakeArtistLeaderboardEntry,
  FakeArtistPlayerResult,
  FakeArtistRole,
  FakeArtistTurnPlayer,
  FakeArtistVoteOption,
  FakeArtistVoteTally,
  FakeArtistWord,
  Language,
} from '@igra/shared';
import { appendStrokeOp, getFakeArtistWords, shuffled } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import type { FakeArtistInternalState } from './FakeArtistState.js';
import {
  CORRECT_VOTE_POINTS,
  DEFAULT_ROUNDS,
  DEFAULT_STROKES,
  FAKE_ESCAPE_POINTS,
  FAKE_GUESS_DURATION,
  FAKE_REDEMPTION_POINTS,
  MAX_ROUNDS,
  MAX_STROKES,
  MIN_ROUNDS,
  MIN_STROKES,
  RESULTS_DURATION,
  REVEAL_ROLE_DURATION,
  STROKE_WIDTH,
  TURN_DURATION,
  VOTING_DURATION,
} from './FakeArtistState.js';

interface FakeArtistCustomContent {
  language?: Language;
  fakeArtistRounds?: number;
  fakeArtistStrokes?: number;
}

function clampRounds(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_ROUNDS;
  const n = Math.floor(raw);
  if (n < MIN_ROUNDS) return MIN_ROUNDS;
  if (n > MAX_ROUNDS) return MAX_ROUNDS;
  return n;
}

function clampStrokes(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_STROKES;
  const n = Math.floor(raw);
  if (n < MIN_STROKES) return MIN_STROKES;
  if (n > MAX_STROKES) return MAX_STROKES;
  return n;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export class FakeArtistModule extends BaseGameModule {
  readonly gameId = 'fake-artist';

  private state!: FakeArtistInternalState;
  private language: Language = 'sr';
  private wordBank: FakeArtistWord[] = [];

  onStart(room: Room, customContent?: unknown): GameState {
    const opts = (customContent as FakeArtistCustomContent | undefined) ?? {};
    this.language = opts.language ?? 'sr';
    this.wordBank = getFakeArtistWords(this.language);

    this.state = {
      phase: 'reveal-role',
      phaseTimeRemaining: REVEAL_ROLE_DURATION,
      totalRounds: clampRounds(opts.fakeArtistRounds),
      currentRound: 1,
      strokesPerPlayer: clampStrokes(opts.fakeArtistStrokes),
      turnOrder: [],
      currentTurnIndex: 0,
      word: null,
      category: null,
      fakeArtistId: null,
      operations: [],
      votes: new Map(),
      expectedVoterIds: new Set(),
      fakeGuessOptions: [],
      fakeGuess: null,
      fakeGuessCorrect: false,
      fakeCaught: false,
      roundScores: new Map(),
      usedWords: new Set(),
      usedFakeIds: new Set(),
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
      case 'fake:submit-stroke':
        return this.handleStroke(room, playerId, data);
      case 'fake:vote':
        return this.handleVote(room, playerId, data);
      case 'fake:guess-word':
        return this.handleGuess(room, playerId, data);
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
    switch (this.state.phase) {
      case 'drawing':
        if (this.currentDrawerId() === playerId) {
          // Their turn — hand off so the game doesn't stall on a dead phone.
          this.advanceTurn(room);
        }
        break;
      case 'voting':
        this.state.expectedVoterIds.delete(playerId);
        if (this.allExpectedVoted(room)) this.transitionAfterVoting(room);
        break;
      case 'fake-guess':
        if (playerId === this.state.fakeArtistId) this.resolveResults(room);
        break;
    }
    return this.buildGameState(room);
  }

  onEnd(_room: Room, _gameState: GameState): void {
    this.state.usedWords.clear();
    this.state.usedFakeIds.clear();
  }

  // --- Player actions ----------------------------------------------------

  private handleStroke(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'drawing') return null;
    if (this.currentDrawerId() !== playerId) return null;

    const raw = data.points;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const points: { x: number; y: number }[] = [];
    for (const p of raw.slice(0, 3000)) {
      const pt = p as { x?: unknown; y?: unknown };
      if (
        typeof pt.x !== 'number' ||
        typeof pt.y !== 'number' ||
        !Number.isFinite(pt.x) ||
        !Number.isFinite(pt.y)
      ) {
        continue;
      }
      points.push({
        x: Math.max(0, Math.min(1, pt.x)),
        y: Math.max(0, Math.min(1, pt.y)),
      });
    }
    if (points.length === 0) return null;
    // A tap leaves one point — duplicate it so lineCap 'round' renders a dot.
    const pts = points.length === 1 ? [points[0], points[0]] : points;

    // Colour is server-authoritative (the drawer's avatar) so nobody can
    // frame another player by sending a foreign colour.
    const player = room.players.find((p) => p.id === playerId);
    const color = player?.avatarColor ?? '#000000';
    appendStrokeOp(this.state.operations, {
      points: pts,
      color,
      width: STROKE_WIDTH,
    });

    this.advanceTurn(room);
    return this.buildGameState(room);
  }

  private handleVote(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'voting') return null;
    if (!this.state.turnOrder.includes(playerId)) return null;
    if (this.state.votes.has(playerId)) return null;

    const suspectId = data.suspectId as string;
    if (!suspectId || suspectId === playerId) return null;
    if (!this.state.turnOrder.includes(suspectId)) return null;

    this.state.votes.set(playerId, suspectId);
    if (this.allExpectedVoted(room)) this.transitionAfterVoting(room);
    return this.buildGameState(room);
  }

  private handleGuess(
    room: Room,
    playerId: string,
    data: Record<string, unknown>
  ): GameState | null {
    if (this.state.phase !== 'fake-guess') return null;
    if (playerId !== this.state.fakeArtistId) return null;
    if (this.state.fakeGuess !== null) return null;

    const word = data.word as string;
    if (!word || !this.state.fakeGuessOptions.includes(word)) return null;

    this.state.fakeGuess = word;
    this.state.fakeGuessCorrect =
      this.state.word !== null && normalize(word) === normalize(this.state.word);
    this.resolveResults(room);
    return this.buildGameState(room);
  }

  // --- Round lifecycle ---------------------------------------------------

  private startRound(room: Room): void {
    const connected = room.players.filter((p) => p.isConnected);
    if (connected.length < 2) {
      this.state.phase = 'ended';
      this.state.phaseTimeRemaining = 0;
      return;
    }

    this.state.turnOrder = shuffled(connected.map((p) => p.id));
    const picked = this.pickWord();
    this.state.word = picked.word;
    this.state.category = picked.category;
    this.state.fakeArtistId = this.pickFake(this.state.turnOrder);
    this.state.operations = [];
    this.state.currentTurnIndex = 0;
    this.state.votes = new Map();
    this.state.expectedVoterIds = new Set();
    this.state.fakeGuessOptions = [];
    this.state.fakeGuess = null;
    this.state.fakeGuessCorrect = false;
    this.state.fakeCaught = false;
    this.state.roundScores = new Map();
    this.state.phase = 'reveal-role';
    this.state.phaseTimeRemaining = REVEAL_ROLE_DURATION;
  }

  private advanceOnTimeout(room: Room): void {
    switch (this.state.phase) {
      case 'reveal-role':
        this.enterDrawing(room);
        break;
      case 'drawing':
        this.advanceTurn(room);
        break;
      case 'voting':
        this.transitionAfterVoting(room);
        break;
      case 'fake-guess':
        this.resolveResults(room);
        break;
      case 'results':
        this.nextRoundOrEnd(room);
        break;
    }
  }

  private enterDrawing(room: Room): void {
    this.state.phase = 'drawing';
    this.state.currentTurnIndex = 0;
    this.state.phaseTimeRemaining = TURN_DURATION;
    this.settleCurrentTurn(room);
  }

  private advanceTurn(room: Room): void {
    this.state.currentTurnIndex += 1;
    if (this.state.currentTurnIndex >= this.totalTurns()) {
      this.transitionToVoting(room);
      return;
    }
    this.state.phaseTimeRemaining = TURN_DURATION;
    this.settleCurrentTurn(room);
  }

  // Skip forward over any drawer who is currently disconnected so the round
  // never stalls waiting on an absent phone; run off the end → voting.
  private settleCurrentTurn(room: Room): void {
    while (
      this.state.currentTurnIndex < this.totalTurns() &&
      !this.isConnected(room, this.currentDrawerId())
    ) {
      this.state.currentTurnIndex += 1;
    }
    if (this.state.currentTurnIndex >= this.totalTurns()) {
      this.transitionToVoting(room);
    }
  }

  private transitionToVoting(room: Room): void {
    this.state.phase = 'voting';
    this.state.phaseTimeRemaining = VOTING_DURATION;
    this.state.votes = new Map();
    this.state.expectedVoterIds = new Set(
      room.players.filter((p) => p.isConnected).map((p) => p.id)
    );
  }

  private transitionAfterVoting(room: Room): void {
    const counts = new Map<string, number>();
    for (const suspectId of this.state.votes.values()) {
      counts.set(suspectId, (counts.get(suspectId) ?? 0) + 1);
    }
    let maxVotes = 0;
    for (const c of counts.values()) maxVotes = Math.max(maxVotes, c);
    const fakeVotes = this.state.fakeArtistId
      ? counts.get(this.state.fakeArtistId) ?? 0
      : 0;
    // Lenient to the real artists: a tie for most votes still catches the fake.
    this.state.fakeCaught = fakeVotes > 0 && fakeVotes === maxVotes;

    if (
      this.state.fakeCaught &&
      this.state.fakeArtistId &&
      this.isConnected(room, this.state.fakeArtistId)
    ) {
      this.state.fakeGuessOptions = this.buildGuessOptions();
      this.state.phase = 'fake-guess';
      this.state.phaseTimeRemaining = FAKE_GUESS_DURATION;
    } else {
      this.resolveResults(room);
    }
  }

  private resolveResults(room: Room): void {
    const scores = new Map<string, number>();
    for (const player of room.players) {
      if (!this.state.turnOrder.includes(player.id)) continue;
      let pts = 0;
      if (player.id === this.state.fakeArtistId) {
        if (!this.state.fakeCaught) pts = FAKE_ESCAPE_POINTS;
        else if (this.state.fakeGuessCorrect) pts = FAKE_REDEMPTION_POINTS;
      } else {
        const votedForFake =
          this.state.votes.get(player.id) === this.state.fakeArtistId;
        pts = votedForFake ? CORRECT_VOTE_POINTS : 0;
      }
      scores.set(player.id, pts);
      player.score += pts;
    }
    this.state.roundScores = scores;
    this.state.phase = 'results';
    this.state.phaseTimeRemaining = RESULTS_DURATION;
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

  private totalTurns(): number {
    return this.state.turnOrder.length * this.state.strokesPerPlayer;
  }

  private currentDrawerId(): string {
    const n = this.state.turnOrder.length;
    if (n === 0) return '';
    return this.state.turnOrder[this.state.currentTurnIndex % n];
  }

  private isConnected(room: Room, playerId: string): boolean {
    return room.players.find((p) => p.id === playerId)?.isConnected === true;
  }

  private pickWord(): FakeArtistWord {
    const available = this.wordBank.filter(
      (w) => !this.state.usedWords.has(w.word)
    );
    const pool = available.length > 0 ? available : this.wordBank;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    this.state.usedWords.add(chosen.word);
    return chosen;
  }

  private pickFake(turnOrder: string[]): string {
    const fresh = turnOrder.filter((id) => !this.state.usedFakeIds.has(id));
    const pool = fresh.length > 0 ? fresh : turnOrder;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    this.state.usedFakeIds.add(chosen);
    return chosen;
  }

  private buildGuessOptions(): string[] {
    const word = this.state.word;
    const category = this.state.category;
    if (!word) return [];
    const sameCategory = this.wordBank
      .filter((w) => w.category === category && w.word !== word)
      .map((w) => w.word);
    const distractors = shuffled(sameCategory).slice(0, 3);
    if (distractors.length < 3) {
      const others = shuffled(
        this.wordBank
          .filter((w) => w.word !== word && !distractors.includes(w.word))
          .map((w) => w.word)
      );
      for (const w of others) {
        if (distractors.length >= 3) break;
        distractors.push(w);
      }
    }
    return shuffled([word, ...distractors]);
  }

  private allExpectedVoted(room: Room): boolean {
    if (this.state.phase !== 'voting') return false;
    for (const id of this.state.expectedVoterIds) {
      if (this.state.votes.has(id)) continue;
      const stillInRoom = room.players.some((p) => p.id === id);
      if (!stillInRoom) continue;
      return false;
    }
    return true;
  }

  private roleFor(playerId: string): FakeArtistRole {
    if (!this.state.turnOrder.includes(playerId)) return 'spectator';
    return playerId === this.state.fakeArtistId ? 'fake' : 'artist';
  }

  // --- Build state -------------------------------------------------------

  private buildGameState(room: Room): GameState {
    const turnOrder: FakeArtistTurnPlayer[] = this.state.turnOrder.map((id) => {
      const p = room.players.find((pp) => pp.id === id);
      return {
        playerId: id,
        name: p?.name ?? '?',
        avatarColor: p?.avatarColor ?? '#888888',
      };
    });

    const hostData: FakeArtistHostData = {
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      category: this.state.category,
      operations: this.state.operations,
      turnOrder,
      strokesPerPlayer: this.state.strokesPerPlayer,
    };

    if (this.state.phase === 'drawing') {
      const drawerId = this.currentDrawerId();
      hostData.currentDrawerId = drawerId;
      hostData.currentDrawerName =
        room.players.find((p) => p.id === drawerId)?.name ?? '?';
      hostData.turnNumber = this.state.currentTurnIndex + 1;
      hostData.totalTurns = this.totalTurns();
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

    if (this.state.phase === 'results' || this.state.phase === 'ended') {
      hostData.leaderboard = this.buildLeaderboard(room);
    }

    if (this.state.phase === 'results') {
      hostData.word = this.state.word ?? undefined;
      hostData.fakeArtistId = this.state.fakeArtistId ?? undefined;
      hostData.fakeArtistName =
        room.players.find((p) => p.id === this.state.fakeArtistId)?.name ?? '?';
      hostData.fakeCaught = this.state.fakeCaught;
      hostData.fakeGuess = this.state.fakeGuess;
      hostData.fakeGuessCorrect = this.state.fakeGuessCorrect;
      hostData.voteTally = this.buildVoteTally(room);
      hostData.results = this.buildResults(room);
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
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }

  private buildControllerData(
    room: Room,
    playerId: string
  ): FakeArtistControllerData {
    const role = this.roleFor(playerId);
    const pd: FakeArtistControllerData = {
      role,
      category: this.state.category,
    };

    // The secret word goes ONLY to real artists, and only while it matters —
    // never in the shared host data, so the fake can't read it off the wire.
    if (
      role === 'artist' &&
      (this.state.phase === 'reveal-role' || this.state.phase === 'drawing')
    ) {
      pd.secretWord = this.state.word ?? undefined;
    }

    if (this.state.phase === 'drawing') {
      pd.isMyTurn = this.currentDrawerId() === playerId;
    }

    if (this.state.phase === 'voting') {
      pd.canVote = role !== 'spectator';
      pd.hasVoted = this.state.votes.has(playerId);
      pd.votedFor = this.state.votes.get(playerId) ?? null;
      pd.voteOptions = this.state.turnOrder
        .filter((id) => id !== playerId)
        .map<FakeArtistVoteOption>((id) => {
          const p = room.players.find((pp) => pp.id === id);
          return {
            playerId: id,
            name: p?.name ?? '?',
            avatarColor: p?.avatarColor ?? '#888888',
          };
        });
    }

    if (this.state.phase === 'fake-guess' && role === 'fake') {
      pd.guessOptions = this.state.fakeGuessOptions;
      pd.hasGuessed = this.state.fakeGuess !== null;
    }

    if (this.state.phase === 'results') {
      pd.ownRoundScore = this.state.roundScores.get(playerId) ?? 0;
    }

    return pd;
  }

  private buildVoteTally(room: Room): FakeArtistVoteTally[] {
    const counts = new Map<string, number>();
    for (const suspectId of this.state.votes.values()) {
      counts.set(suspectId, (counts.get(suspectId) ?? 0) + 1);
    }
    return this.state.turnOrder
      .map<FakeArtistVoteTally>((id) => {
        const p = room.players.find((pp) => pp.id === id);
        return {
          suspectId: id,
          name: p?.name ?? '?',
          avatarColor: p?.avatarColor ?? '#888888',
          votes: counts.get(id) ?? 0,
          isFake: id === this.state.fakeArtistId,
        };
      })
      .sort((a, b) => b.votes - a.votes);
  }

  private buildResults(room: Room): FakeArtistPlayerResult[] {
    return this.state.turnOrder
      .map<FakeArtistPlayerResult>((id) => {
        const p = room.players.find((pp) => pp.id === id);
        return {
          playerId: id,
          name: p?.name ?? '?',
          avatarColor: p?.avatarColor ?? '#888888',
          isFake: id === this.state.fakeArtistId,
          votedForFake: this.state.votes.get(id) === this.state.fakeArtistId,
          roundScore: this.state.roundScores.get(id) ?? 0,
          totalScore: p?.score ?? 0,
        };
      })
      .sort((a, b) => b.roundScore - a.roundScore);
  }

  private buildLeaderboard(room: Room): FakeArtistLeaderboardEntry[] {
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
