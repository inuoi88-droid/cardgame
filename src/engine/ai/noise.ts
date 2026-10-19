/** 「やさしい」用の評価のゆらぎ。シードと候補の番号だけから決まる（エンジンと同じく、外部の乱数は使わない） */

function hash32(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/** 0 以上 1 未満 */
function uniform(seed: number, index: number, k: number): number {
  return (hash32(seed * 7 + k, index * 13 + 1) + 0.5) / 4294967296;
}

/** 平均 0・標準偏差 sigma の正規乱数（Box–Muller） */
export function gaussian(seed: number, index: number, sigma: number): number {
  const u1 = uniform(seed, index, 1);
  const u2 = uniform(seed, index, 2);
  return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
