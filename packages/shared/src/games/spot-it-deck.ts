/**
 * Spot It / Dobble deck generator.
 *
 * For prime `p`, the projective-plane construction yields `p² + p + 1`
 * cards each with `p + 1` symbols, where any two cards share exactly
 * one symbol. We use `p = 7` → 57 cards × 8 symbols, matching the
 * classic Dobble deck.
 */

import { shuffleInPlace } from '../utils/shuffle.js';

export const SPOT_IT_PRIME = 7;
export const SPOT_IT_SYMBOLS_PER_CARD = SPOT_IT_PRIME + 1; // 8
export const SPOT_IT_DECK_SIZE = SPOT_IT_PRIME * SPOT_IT_PRIME + SPOT_IT_PRIME + 1; // 57

/**
 * 57 visually distinct emojis. Order matters only for testing — the
 * deck generator uses indices and the dealer shuffles per round.
 */
export const SPOT_IT_SYMBOLS: string[] = [
  '🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁',
  '🐸', '🐵', '🐔', '🦄', '🐝', '🦋', '🐢', '🦀',
  '🐙', '🦑', '🐳', '🦓', '🦒', '🐘', '🦘', '🦔',
  '🍎', '🍌', '🍇', '🍓', '🍑', '🍒', '🥑', '🍍',
  '🍕', '🍔', '🌭', '🍟', '🍩', '🍰', '🍦', '🧀',
  '⚽', '🏀', '🎾', '🎲', '🎸', '🎺', '🎨', '🎯',
  '🚗', '🚀', '⛵', '✈️', '🚲', '🌈', '⭐', '☀️',
  '🌙',
];

if (SPOT_IT_SYMBOLS.length !== SPOT_IT_DECK_SIZE) {
  throw new Error(
    `SPOT_IT_SYMBOLS must have ${SPOT_IT_DECK_SIZE} entries (has ${SPOT_IT_SYMBOLS.length})`
  );
}

/**
 * Generate `p² + p + 1` cards of `p + 1` symbol indices using the
 * standard projective-plane construction. Any two returned cards share
 * exactly one symbol index. Requires `p` prime (otherwise the
 * arithmetic mod p doesn't form a field and the shared-symbol
 * invariant breaks).
 */
export function generateDobbleDeck(p: number = SPOT_IT_PRIME): number[][] {
  const cards: number[][] = [];

  // Card 0: 0, 1, ..., p
  const first: number[] = [];
  for (let i = 0; i <= p; i++) first.push(i);
  cards.push(first);

  // Next p cards: anchored at symbol 0
  for (let i = 0; i < p; i++) {
    const card: number[] = [0];
    for (let j = 0; j < p; j++) {
      card.push(p + 1 + i * p + j);
    }
    cards.push(card);
  }

  // Remaining p² cards
  for (let k = 0; k < p; k++) {
    for (let i = 0; i < p; i++) {
      const card: number[] = [k + 1];
      for (let j = 0; j < p; j++) {
        card.push(p + 1 + j * p + ((i + k * j) % p));
      }
      cards.push(card);
    }
  }

  return cards;
}

/**
 * Pick a center card + one card per player. Each player's card shares
 * exactly one symbol with the center (the match they're hunting).
 * Symbol order within each card is shuffled so layout slots aren't
 * predictable.
 */
export function dealRound(
  deck: number[][],
  playerIds: string[]
): { center: number[]; hands: Record<string, number[]> } {
  const needed = playerIds.length + 1;
  if (deck.length < needed) {
    throw new Error(`Deck too small: need ${needed} cards, have ${deck.length}`);
  }

  const indices = shuffleInPlace([...Array(deck.length).keys()]).slice(0, needed);
  const center = shuffleInPlace([...deck[indices[0]]]);
  const hands: Record<string, number[]> = {};
  for (let i = 0; i < playerIds.length; i++) {
    hands[playerIds[i]] = shuffleInPlace([...deck[indices[i + 1]]]);
  }
  return { center, hands };
}

/**
 * Returns the symbol index shared by two cards. Throws if no shared
 * symbol exists — by construction every pair of generated cards has
 * exactly one, so a throw indicates a programming error (e.g. cards
 * weren't from the same generated deck).
 */
export function findMatch(cardA: number[], cardB: number[]): number {
  const setA = new Set(cardA);
  for (const s of cardB) {
    if (setA.has(s)) return s;
  }
  throw new Error('Cards share no symbol — not from the same Dobble deck?');
}
