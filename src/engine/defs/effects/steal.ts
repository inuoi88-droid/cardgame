import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.steal;

export default defineEffect({
  id: 'steal',
  name: '奪取',
  group: 'special',
  order: 73,
  summary: '相手モンスター1体を自分の場に移す（レジェンドのみ）',
  targetRule: 'enemyMonsterOne',
  minRarity: 'legend',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (_e, c) => `${c.target}を自分の場に移す`,
  battle: {
    resolve(rt) {
      for (const t of rt.targets) rt.steal(t);
    },
  },
});
