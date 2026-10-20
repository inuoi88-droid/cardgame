import { BALANCE } from '../../balance.ts';
import { defineEffect, n, countParam } from '../../define.ts';

const B = BALANCE.effects.draw;

export default defineEffect({
  id: 'draw',
  name: 'ドロー',
  group: 'resource',
  order: 50,
  summary: 'カードをN枚引く',
  value: countParam('枚数', { default: 1 }),
  targetRule: 'self',
  // 対象「お互い」を選べる（MTG 要素 ○ バッチA）
  symmetric: true,
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `カードを${n(e)}枚引く`,
  battle: {
    resolve(rt, e) {
      rt.draw(rt.controller, n(e));
    },
  },
});
