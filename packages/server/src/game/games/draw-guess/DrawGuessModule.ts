import type {
  Room,
  GameState,
  Stroke,
  DrawGuessHostData,
  DrawGuessTurnScore,
  DrawGuessLeaderboardEntry,
} from '@igra/shared';
import { DRAW_WORD_BANK } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import type { DrawGuessInternalState, DrawGuessPhase } from './DrawGuessState.js';
import {
  CHOOSING_WORD_DURATION,
  DRAW_TIME_LIMIT,
  TURN_RESULTS_DURATION,
  LEADERBOARD_DURATION,
} from './DrawGuessState.js';

export class DrawGuessModule extends BaseGameModule {
  readonly gameId = 'draw-guess';

  private state!: DrawGuessInternalState;
  private usedWords = new Set<string>();

  onStart(room: Room): GameState {
    const connectedPlayers = room.players.filter((p) => p.isConnected);
    const turnOrder = connectedPlayers
      .map((p) => p.id)
      .sort(() => Math.random() - 0.5);

    const totalRounds = Math.min(room.settings.roundCount, 3);

    this.state = {
      phase: 'choosing-word',
      phaseTimeRemaining: CHOOSING_WORD_DURATION,
      turnOrder,
      currentTurnIndex: 0,
      currentRound: 1,
      totalRounds,
      currentWord: null,
      wordChoices: this.pickWordChoices(),
      wordHint: '',
      drawTimeLimit: DRAW_TIME_LIMIT,
      strokes: [],
      guesses: [],
      correctGuessers: [],
      turnScores: [],
      drawingStartTime: 0,
      lastHintRevealFraction: 0,
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
    const drawerId = this.currentDrawerId();

    switch (action) {
      case 'draw:choose-word': {
        if (playerId !== drawerId || this.state.phase !== 'choosing-word') return null;
        const wordIndex = data.wordIndex as number;
        if (wordIndex < 0 || wordIndex >= this.state.wordChoices.length) return null;

        const word = this.state.wordChoices[wordIndex];
        this.usedWords.add(word);
        this.state.currentWord = word;
        this.state.wordHint = this.buildHint(word, []);
        this.state.phase = 'drawing';
        this.state.phaseTimeRemaining = this.state.drawTimeLimit;
        this.state.drawingStartTime = Date.now();
        this.state.lastHintRevealFraction = 0;
        return this.buildGameState(room);
      }

      case 'draw:stroke': {
        if (playerId !== drawerId || this.state.phase !== 'drawing') return null;
        const stroke: Stroke = {
          points: data.points as { x: number; y: number }[],
          color: data.color as string,
          width: data.width as number,
        };
        this.state.strokes.push(stroke);
        return this.buildGameState(room);
      }

      case 'draw:clear': {
        if (playerId !== drawerId || this.state.phase !== 'drawing') return null;
        this.state.strokes = [];
        return this.buildGameState(room);
      }

      case 'draw:guess': {
        if (playerId === drawerId || this.state.phase !== 'drawing') return null;
        if (this.state.correctGuessers.includes(playerId)) return null;

        const text = (data.text as string).trim();
        if (!text) return null;

        const player = room.players.find((p) => p.id === playerId);
        const playerName = player?.name ?? 'Unknown';
        const correct = this.checkGuess(text, this.state.currentWord!);

        this.state.guesses.push({ playerId, playerName, text, correct });

        if (correct) {
          this.state.correctGuessers.push(playerId);

          // Score guesser based on time remaining
          const timeElapsed = (Date.now() - this.state.drawingStartTime) / 1000;
          const timeRemaining = Math.max(0, this.state.drawTimeLimit - timeElapsed);
          const guesserScore = Math.round(500 * (timeRemaining / this.state.drawTimeLimit));
          if (player) player.score += guesserScore;

          // Check if all guessers have guessed
          const guessers = room.players.filter(
            (p) => p.isConnected && p.id !== drawerId
          );
          if (this.state.correctGuessers.length >= guessers.length) {
            this.transitionToTurnResults(room);
          }
        }

        return this.buildGameState(room);
      }

      default:
        return null;
    }
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    this.state.phaseTimeRemaining -= deltaMs / 1000;

    // Progressive hints during drawing phase
    if (this.state.phase === 'drawing' && this.state.currentWord) {
      this.maybeRevealHint();
    }

    if (this.state.phaseTimeRemaining <= 0) {
      this.advancePhase(room);
    }

    return this.buildGameState(room);
  }

  onPlayerDisconnect(
    room: Room,
    _gameState: GameState,
    playerId: string
  ): GameState | null {
    // If the drawer disconnects during choosing or drawing, skip to next turn
    if (
      playerId === this.currentDrawerId() &&
      (this.state.phase === 'choosing-word' || this.state.phase === 'drawing')
    ) {
      this.transitionToTurnResults(room);
      return this.buildGameState(room);
    }
    return null;
  }

  onEnd(_room: Room, _gameState: GameState): void {
    this.usedWords.clear();
  }

  // --- Phase transitions ---

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'choosing-word':
        // Auto-pick first word if time runs out
        if (!this.state.currentWord && this.state.wordChoices.length > 0) {
          const word = this.state.wordChoices[0];
          this.usedWords.add(word);
          this.state.currentWord = word;
          this.state.wordHint = this.buildHint(word, []);
        }
        this.state.phase = 'drawing';
        this.state.phaseTimeRemaining = this.state.drawTimeLimit;
        this.state.drawingStartTime = Date.now();
        this.state.lastHintRevealFraction = 0;
        break;

      case 'drawing':
        this.transitionToTurnResults(room);
        break;

      case 'turn-results':
        this.state.phase = 'leaderboard';
        this.state.phaseTimeRemaining = LEADERBOARD_DURATION;
        break;

      case 'leaderboard':
        this.nextTurnOrEnd(room);
        break;
    }
  }

  private transitionToTurnResults(room: Room): void {
    // Score the drawer: 100 points per correct guesser
    const drawerId = this.currentDrawerId();
    const drawer = room.players.find((p) => p.id === drawerId);
    const drawerScore = this.state.correctGuessers.length * 100;
    if (drawer) drawer.score += drawerScore;

    // Build turn scores for display
    this.state.turnScores = room.players
      .filter((p) => p.isConnected)
      .map((p) => {
        let roundScore = 0;
        if (p.id === drawerId) {
          roundScore = drawerScore;
        } else if (this.state.correctGuessers.includes(p.id)) {
          // Recalculate guesser score from guess order
          const guessEntry = this.state.guesses.find(
            (g) => g.playerId === p.id && g.correct
          );
          if (guessEntry) {
            const guessIndex = this.state.guesses.indexOf(guessEntry);
            // Find the time-based score we already awarded — approximate from order
            const timeElapsed = (Date.now() - this.state.drawingStartTime) / 1000;
            const approxTimeRemaining = Math.max(0, this.state.drawTimeLimit - timeElapsed);
            roundScore = Math.round(500 * (approxTimeRemaining / this.state.drawTimeLimit));
            // Adjust: earlier guessers scored more since they guessed earlier
            // The score was already given in onPlayerAction, so just show approximate
            roundScore = Math.max(roundScore, 50); // minimum display
          }
        }
        return { playerId: p.id, roundScore };
      });

    this.state.phase = 'turn-results';
    this.state.phaseTimeRemaining = TURN_RESULTS_DURATION;
  }

  private nextTurnOrEnd(room: Room): void {
    const nextTurnIndex = this.state.currentTurnIndex + 1;

    if (nextTurnIndex >= this.state.turnOrder.length) {
      // End of round
      if (this.state.currentRound < this.state.totalRounds) {
        this.state.currentRound++;
        this.state.currentTurnIndex = 0;
        this.resetTurnState();
        this.state.phase = 'choosing-word';
        this.state.phaseTimeRemaining = CHOOSING_WORD_DURATION;
        this.state.wordChoices = this.pickWordChoices();
      } else {
        this.state.phase = 'ended';
        this.state.phaseTimeRemaining = 0;
      }
    } else {
      this.state.currentTurnIndex = nextTurnIndex;
      this.resetTurnState();
      this.state.phase = 'choosing-word';
      this.state.phaseTimeRemaining = CHOOSING_WORD_DURATION;
      this.state.wordChoices = this.pickWordChoices();
    }
  }

  private resetTurnState(): void {
    this.state.currentWord = null;
    this.state.wordHint = '';
    this.state.strokes = [];
    this.state.guesses = [];
    this.state.correctGuessers = [];
    this.state.turnScores = [];
    this.state.lastHintRevealFraction = 0;
  }

  // --- Hints ---

  private maybeRevealHint(): void {
    if (!this.state.currentWord) return;

    const timeElapsed = (Date.now() - this.state.drawingStartTime) / 1000;
    const fraction = timeElapsed / this.state.drawTimeLimit;

    // Reveal a letter every 20% of time elapsed
    const revealThreshold = this.state.lastHintRevealFraction + 0.2;
    if (fraction >= revealThreshold) {
      this.state.lastHintRevealFraction = revealThreshold;

      const word = this.state.currentWord;
      const letterIndices = this.getLetterIndices(word);
      const numToReveal = Math.floor(
        (revealThreshold / 0.2) * (letterIndices.length * 0.15)
      );
      const revealedIndices = letterIndices.slice(0, Math.min(numToReveal, letterIndices.length - 1));
      this.state.wordHint = this.buildHint(word, revealedIndices);
    }
  }

  private buildHint(word: string, revealedIndices: number[]): string {
    return word
      .split('')
      .map((ch, i) => {
        if (ch === ' ') return '  ';
        if (revealedIndices.includes(i)) return ch;
        return '_';
      })
      .join(' ');
  }

  private getLetterIndices(word: string): number[] {
    const indices: number[] = [];
    for (let i = 0; i < word.length; i++) {
      if (word[i] !== ' ') indices.push(i);
    }
    // Shuffle for random reveal order
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }

  // --- Word selection ---

  private pickWordChoices(): string[] {
    const available = DRAW_WORD_BANK.filter((w) => !this.usedWords.has(w.word));
    const shuffled = [...available].sort(() => Math.random() - 0.5);

    // Try to pick one from each difficulty
    const easy = shuffled.find((w) => w.difficulty === 'easy');
    const medium = shuffled.find((w) => w.difficulty === 'medium');
    const hard = shuffled.find((w) => w.difficulty === 'hard');

    const choices = [easy, medium, hard]
      .filter((w): w is NonNullable<typeof w> => w != null)
      .map((w) => w.word);

    // Pad to 3 if needed
    while (choices.length < 3 && shuffled.length > choices.length) {
      const next = shuffled.find((w) => !choices.includes(w.word));
      if (next) choices.push(next.word);
      else break;
    }

    return choices;
  }

  // --- Guess checking ---

  private checkGuess(guess: string, word: string): boolean {
    return guess.toLowerCase().trim() === word.toLowerCase().trim();
  }

  // --- Helpers ---

  private currentDrawerId(): string {
    return this.state.turnOrder[this.state.currentTurnIndex];
  }

  private totalTurns(): number {
    return this.state.turnOrder.length * this.state.totalRounds;
  }

  private currentTurnNumber(): number {
    return (this.state.currentRound - 1) * this.state.turnOrder.length +
      this.state.currentTurnIndex + 1;
  }

  // --- Build game state ---

  private buildGameState(room: Room): GameState {
    const drawerId = this.currentDrawerId();
    const drawer = room.players.find((p) => p.id === drawerId);

    const hostData: DrawGuessHostData = {
      drawerId,
      drawerName: drawer?.name ?? 'Unknown',
      wordHint: this.state.wordHint,
      wordLength: this.state.currentWord?.length ?? 0,
      timeLimit: this.state.drawTimeLimit,
      strokes: this.state.strokes,
      guesses: this.state.guesses,
      correctGuessers: this.state.correctGuessers,
    };

    if (this.state.phase === 'turn-results' || this.state.phase === 'leaderboard' || this.state.phase === 'ended') {
      hostData.revealedWord = this.state.currentWord ?? undefined;
      hostData.turnScores = room.players
        .filter((p) => p.isConnected)
        .map((p) => {
          const ts = this.state.turnScores.find((s) => s.playerId === p.id);
          return {
            playerId: p.id,
            playerName: p.name,
            avatarColor: p.avatarColor,
            roundScore: ts?.roundScore ?? 0,
            totalScore: p.score,
          };
        });
    }

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      host: hostData,
    };

    // Add leaderboard for leaderboard/ended phases
    if (this.state.phase === 'leaderboard' || this.state.phase === 'ended') {
      const leaderboard: DrawGuessLeaderboardEntry[] = room.players
        .map((p) => ({
          playerId: p.id,
          name: p.name,
          avatarColor: p.avatarColor,
          score: p.score,
          rank: 0,
        }))
        .sort((a, b) => b.score - a.score)
        .map((entry, i) => ({ ...entry, rank: i + 1 }));
      data.leaderboard = leaderboard;
    }

    // Per-player data
    const playerData: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const isDrawer = player.id === drawerId;
      const pd: Record<string, unknown> = { isDrawer };

      if (isDrawer && this.state.phase === 'choosing-word') {
        pd.wordChoices = this.state.wordChoices;
      }
      if (!isDrawer) {
        pd.hasGuessedCorrectly = this.state.correctGuessers.includes(player.id);
      }

      playerData[player.id] = pd;
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.currentTurnNumber(),
      totalRounds: this.totalTurns(),
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }
}
