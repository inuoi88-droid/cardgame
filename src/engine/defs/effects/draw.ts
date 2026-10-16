import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.draw;

export default defineEffect({
  id: 'draw',
  name: 'ドロー',
  group: 'resource',
  order: 50,
  summary: 'カードをN枚引く',
  value: valueParam('枚数', { default: 1 }),
  targetRule: 'self',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `カードを${n(e)}枚引く`,
});
