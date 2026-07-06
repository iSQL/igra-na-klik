import type { IGameModule } from './IGameModule.js';

export type GameModuleFactory = () => IGameModule;

/**
 * Registry of game module factories. Modules hold per-game mutable state on
 * the instance, so every room gets its own instance (created via `create`)
 * — a shared singleton would let two rooms playing the same game clobber
 * each other's state.
 */
export class GameRegistry {
  private factories = new Map<string, GameModuleFactory>();

  register(factory: GameModuleFactory): void {
    // Probe instance just to read the gameId; discarded immediately.
    this.factories.set(factory().gameId, factory);
  }

  create(gameId: string): IGameModule | undefined {
    return this.factories.get(gameId)?.();
  }

  has(gameId: string): boolean {
    return this.factories.has(gameId);
  }

  list(): string[] {
    return Array.from(this.factories.keys());
  }
}
