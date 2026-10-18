import { BALANCE } from '../../balance.ts';
import { defineEffect, n, countParam } from '../../define.ts';

const B = BALANCE.effects.weak;

export default defineEffect({
  id: 'weak',
  name: '弱体',
  group: 'status',
  order: 33,
  summary: `Nターンの間、与えるダメージ−${BALANCE.battle.weakRate * 100}%`,
  value: countParam('ターン数', { default: 1, max: B.maxValue }),
  targetRule: 'enemyAny',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}に弱体（${n(e)}ターン）を与える`,
  shortValue: (e) => `${n(e)}ターン`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.addStatus(t, 'weak', n(e));
    },
  },
});
