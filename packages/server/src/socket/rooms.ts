/**
 * Socket.io room-name helpers. Besides the game room itself (its 2-letter
 * code), every player socket joins `player:<playerId>` and every host
 * socket joins `host:<roomCode>` so targeted emits are O(1) instead of a
 * scan over every connected socket. Prefixes can't collide with room codes
 * (codes are 2 uppercase letters).
 */
export function playerRoom(playerId: string): string {
  return `player:${playerId}`;
}

export function hostRoom(roomCode: string): string {
  return `host:${roomCode}`;
}
