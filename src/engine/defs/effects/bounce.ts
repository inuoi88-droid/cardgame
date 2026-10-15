import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.bounce;

export default defineEffect({
  id: 'bounce',
  name: 'バウンス',
  group: 'disrupt',
  order: 63,
  summary: '相手モンスター1体を持ち主の手札に戻す',
  targetRule: 'enemyMonsterOne',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (_e, c) => `${c.target}を持ち主の手札に戻す`,
});
