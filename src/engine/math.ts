/** ポイントの丸め。浮動小数の誤差（例：3×0.7＝2.0999…）で結果がずれないよう、微小な値を補正してから丸める。 */
const EPSILON = 1e-9;

/** 効果のポイント：小数点以下を切り上げ */
export function ceilPoints(x: number): number {
  return Math.ceil(x - EPSILON) + 0;
}

/** デメリットのポイント：小数点以下を切り捨て */
export function floorPoints(x: number): number {
  return Math.floor(x + EPSILON) + 0;
}

/** 表示用：小数第2位までに丸めた値 */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function isIntInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}
