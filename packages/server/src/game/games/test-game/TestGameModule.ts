import type { Room, GameState } from '@igra/shared';
import { BaseGameModule } from '../../BaseGameModule.js';

export class TestGameModule extends BaseGameModule {
  readonly gameId = 'test-game';

  onStart(room: Room): GameState {
    return {
      gameId: this.gameId,
      phase: 'playing',
      round: 1,
      totalRounds: 1,
      timeRemaining: 30,
      data: {
        winnerId: null,
        winnerName: null,
      },
      playerData: {},
    };
  }

  onPlayerAction(
    room: Room,
    gameState: GameState,
    playerId: string,
    action: string,
    _data: Record<string, unknown>
  ): GameState | null {
    if (action !== 'press' || gameState.phase !== 'playing') return null;

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;

    player.score += 100;

    return {
      ...gameState,
      phase: 'ended',
      data: {
        winnerId: playerId,
        winnerName: player.name,
      },
    };
  }

  onTick(
    _room: Room,
    gameState: GameState,
    deltaMs: number
  ): GameState | null {
    if (gameState.phase !== 'playing') return null;

    const timeRemaining = gameState.timeRemaining - deltaMs / 1000;
    if (timeRemaining <= 0) {
      return {
        ...gameState,
        phase: 'ended',
        timeRemaining: 0,
        data: { winnerId: null, winnerName: null },
      };
    }

    return { ...gameState, timeRemaining };
  }
}
