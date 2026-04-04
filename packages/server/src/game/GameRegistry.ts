import type { IGameModule } from './IGameModule.js';

export class GameRegistry {
  private modules = new Map<string, IGameModule>();

  register(module: IGameModule): void {
    this.modules.set(module.gameId, module);
  }

  get(gameId: string): IGameModule | undefined {
    return this.modules.get(gameId);
  }

  has(gameId: string): boolean {
    return this.modules.has(gameId);
  }

  list(): string[] {
    return Array.from(this.modules.keys());
  }
}
