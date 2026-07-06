/**
 * Unbiased Fisher-Yates shuffle, in place. Prefer this over
 * `.sort(() => Math.random() - 0.5)`, which is biased and O(n log n).
 */
export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Copy-then-shuffle convenience for readonly inputs. */
export function shuffled<T>(items: readonly T[]): T[] {
  return shuffleInPlace([...items]);
}
