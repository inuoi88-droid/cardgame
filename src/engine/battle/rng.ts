/** シード付き乱数（mulberry32）。内部状態は GameState.rng に持つので、同じシードなら同じ結果になる。 */

export function nextRandom(g: { rng: number }): number {
  g.rng = (g.rng + 0x6d2b79f5) | 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 0 以上 n 未満の整数 */
export function randInt(g: { rng: number }, n: number): number {
  return Math.floor(nextRandom(g) * n);
}

export function pick<T>(g: { rng: number }, items: readonly T[]): T | undefined {
  return items.length === 0 ? undefined : items[randInt(g, items.length)];
}

/** その場で並べ替える（Fisher–Yates） */
export function shuffle<T>(g: { rng: number }, items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(g, i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

/** 任意の数をシードにする */
export function normalizeSeed(seed: number): number {
  return Math.floor(seed) | 0;
}
