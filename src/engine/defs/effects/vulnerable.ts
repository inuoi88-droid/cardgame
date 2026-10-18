import { BALANCE } from '../../balance.ts';
import { defineEffect, n, countParam } from '../../define.ts';

const B = BALANCE.effects.vulnerable;

export default defineEffect({
  id: 'vulnerable',
  name: '脆弱',
  group: 'status',
  order: 34,
  summary: `Nターンの間、受けるダメージ+${BALANCE.battle.vulnerableRate * 100}%`,
  value: countParam('ターン数', { default: 1, max: B.maxValue }),
  targetRule: 'enemyAny',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}に脆弱（${n(e)}ターン）を与える`,
  shortValue: (e) => `${n(e)}ターン`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.addStatus(t, 'vulnerable', n(e));
    },
  },
});
