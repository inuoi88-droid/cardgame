import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.retain;

export default defineEffect({
  id: 'retain',
  name: '保持',
  group: 'resource',
  order: 56,
  summary: 'ターン終了時に手札を1枚残せる',
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => 'ターン終了時に手札を1枚残せる',
  battle: {
    resolve(rt) {
      rt.addRetain(rt.controller, 1);
    },
  },
});
