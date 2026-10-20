import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.heal;

export default defineEffect({
  id: 'heal',
  name: '回復',
  group: 'defense',
  order: 21,
  summary: '自分のHPをN回復する',
  value: valueParam('回復量', { default: 2 }),
  targetRule: 'self',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `HPを${n(e)}回復する`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.heal(t, n(e));
    },
  },
});
