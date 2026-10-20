import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.weaken;

export default defineEffect({
  id: 'weaken',
  name: '弱化',
  group: 'disrupt',
  order: 64,
  summary: '相手モンスター1体の攻撃力−N（永続、最低0）',
  value: valueParam('低下量', { default: 1, max: B.maxValue }),
  targetRule: 'enemyMonsterOne',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}の攻撃力を−${n(e)}する`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.changeAttack(t, -n(e));
    },
  },
});
