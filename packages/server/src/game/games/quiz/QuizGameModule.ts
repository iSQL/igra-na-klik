import type { Room, GameState, QuizQuestionFull, QuizResultData, QuizLeaderboardEntry } from '@igra/shared';
import { QUIZ_QUESTION_BANK, parseQuizImport } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';
import type { QuizInternalState, QuizPhase, QuizPlayerAnswer } from './QuizState.js';

const SHOWING_QUESTION_DURATION = 3;
const SHOWING_RESULTS_DURATION = 3;
const LEADERBOARD_DURATION = 2;
const NUM_QUESTIONS = 10;

export class QuizGameModule extends BaseGameModule {
  readonly gameId = 'quiz';

  private state!: QuizInternalState;

  onStart(room: Room, customContent?: unknown): GameState {
    let sourceBank: QuizQuestionFull[] = QUIZ_QUESTION_BANK;
    const customQuestions =
      customContent && typeof customContent === 'object'
        ? (customContent as { customQuestions?: unknown }).customQuestions
        : undefined;
    if (customQuestions !== undefined) {
      const parsed = parseQuizImport(customQuestions);
      if (parsed.ok) {
        sourceBank = parsed.questions;
      }
      // On failure: silent fallback to default bank. Host already validated.
    }

    const shuffled = [...sourceBank]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(NUM_QUESTIONS, sourceBank.length));

    this.state = {
      questions: shuffled,
      currentQuestionIndex: 0,
      phase: 'showing-question',
      phaseTimeRemaining: SHOWING_QUESTION_DURATION,
      answers: new Map(),
      questionStartTime: Date.now(),
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
    if (action !== 'quiz:answer' || this.state.phase !== 'answering') return null;
    if (this.state.answers.has(playerId)) return null;

    const optionIndex = data.optionIndex as number;
    const question = this.currentQuestion();
    const timeMs = Date.now() - this.state.questionStartTime;
    const correct = optionIndex === question.correctIndex;

    this.state.answers.set(playerId, { optionIndex, timeMs, correct });

    if (correct) {
      const timeRemaining = Math.max(0, question.timeLimit * 1000 - timeMs);
      const score = Math.round(1000 * (timeRemaining / (question.timeLimit * 1000)));
      const player = room.players.find((p) => p.id === playerId);
      if (player) player.score += score;
    }

    // Check if all connected players have answered
    const connectedPlayers = room.players.filter((p) => p.isConnected);
    if (this.state.answers.size >= connectedPlayers.length) {
      this.transitionToResults(room);
    }

    return this.buildGameState(room);
  }

  onTick(room: Room, _gameState: GameState, deltaMs: number): GameState | null {
    this.state.phaseTimeRemaining -= deltaMs / 1000;

    if (this.state.phaseTimeRemaining <= 0) {
      this.advancePhase(room);
    }

    return this.buildGameState(room);
  }

  onEnd(_room: Room, _gameState: GameState): void {
    // cleanup
  }

  private advancePhase(room: Room): void {
    switch (this.state.phase) {
      case 'showing-question':
        this.state.phase = 'answering';
        this.state.phaseTimeRemaining = this.currentQuestion().timeLimit;
        this.state.questionStartTime = Date.now();
        this.state.answers = new Map();
        break;

      case 'answering':
        this.transitionToResults(room);
        break;

      case 'showing-results':
        this.state.phase = 'leaderboard';
        this.state.phaseTimeRemaining = LEADERBOARD_DURATION;
        break;

      case 'leaderboard':
        if (this.state.currentQuestionIndex < this.state.questions.length - 1) {
          this.state.currentQuestionIndex++;
          this.state.phase = 'showing-question';
          this.state.phaseTimeRemaining = SHOWING_QUESTION_DURATION;
          this.state.answers = new Map();
        } else {
          this.state.phase = 'ended';
          this.state.phaseTimeRemaining = 0;
        }
        break;
    }
  }

  private transitionToResults(_room: Room): void {
    this.state.phase = 'showing-results';
    this.state.phaseTimeRemaining = SHOWING_RESULTS_DURATION;
  }

  private currentQuestion(): QuizQuestionFull {
    return this.state.questions[this.state.currentQuestionIndex];
  }

  private buildGameState(room: Room): GameState {
    const question = this.currentQuestion();
    const connectedPlayers = room.players.filter((p) => p.isConnected);

    const data: Record<string, unknown> = {
      phase: this.state.phase,
      questionIndex: this.state.currentQuestionIndex,
      totalQuestions: this.state.questions.length,
    };

    const playerData: Record<string, Record<string, unknown>> = {};

    switch (this.state.phase) {
      case 'showing-question':
        data.questionText = question.text;
        break;

      case 'answering':
        data.questionText = question.text;
        data.options = question.options;
        data.timeLimit = question.timeLimit;
        data.answeredCount = this.state.answers.size;
        data.totalPlayers = connectedPlayers.length;

        for (const player of room.players) {
          const answer = this.state.answers.get(player.id);
          playerData[player.id] = {
            hasAnswered: !!answer,
            selectedIndex: answer?.optionIndex ?? null,
          };
        }
        break;

      case 'showing-results': {
        const results: QuizResultData = {
          question: { ...question, correctIndex: question.correctIndex },
          answers: Array.from(this.state.answers.entries()).map(
            ([playerId, a]) => ({
              playerId,
              optionIndex: a.optionIndex,
              timeMs: a.timeMs,
              correct: a.correct,
            })
          ),
          scores: room.players.map((p) => {
            const answer = this.state.answers.get(p.id);
            let roundScore = 0;
            if (answer?.correct) {
              const timeRemaining = Math.max(
                0,
                question.timeLimit * 1000 - answer.timeMs
              );
              roundScore = Math.round(
                1000 * (timeRemaining / (question.timeLimit * 1000))
              );
            }
            return {
              playerId: p.id,
              roundScore,
              totalScore: p.score,
            };
          }),
        };
        data.results = results;
        break;
      }

      case 'leaderboard': {
        const leaderboard: QuizLeaderboardEntry[] = room.players
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
        break;
      }
    }

    return {
      gameId: this.gameId,
      phase: this.state.phase,
      round: this.state.currentQuestionIndex + 1,
      totalRounds: this.state.questions.length,
      timeRemaining: Math.max(0, Math.ceil(this.state.phaseTimeRemaining)),
      data,
      playerData,
    };
  }
}
