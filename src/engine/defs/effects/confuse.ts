import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.confuse;

export default defineEffect({
  id: 'confuse',
  name: '混乱',
  group: 'status',
  order: 37,
  summary: '次のターン、モンスターの攻撃対象がランダムになる',
  targetRule: 'enemyMonster',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (_e, c) => `${c.target}を混乱させる`,
});
