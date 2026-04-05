import type { Room, GameState } from '@igra/shared';
import type { IGameModule } from './IGameModule.js';

export abstract class BaseGameModule implements IGameModule {
  abstract readonly gameId: string;

  abstract onStart(room: Room, customContent?: unknown): GameState;

  onPlayerAction(
    _room: Room,
    _gameState: GameState,
    _playerId: string,
    _action: string,
    _data: Record<string, unknown>
  ): GameState | null {
    return null;
  }

  onTick(
    _room: Room,
    _gameState: GameState,
    _deltaMs: number
  ): GameState | null {
    return null;
  }

  onPlayerDisconnect(
    _room: Room,
    _gameState: GameState,
    _playerId: string
  ): GameState | null {
    return null;
  }

  onEnd(_room: Room, _gameState: GameState): void {}
}
