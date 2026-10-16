import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.repair;

export default defineEffect({
  id: 'repair',
  name: '修理',
  group: 'defense',
  order: 24,
  summary: '自分のモンスター1体の体力をN回復する（最大値まで）',
  value: valueParam('回復量', { default: 3 }),
  targetRule: 'allyMonsterOne',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}の体力を${n(e)}回復する`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.heal(t, n(e));
    },
  },
});
