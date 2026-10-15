import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.dispel;

export default defineEffect({
  id: 'dispel',
  name: '解除',
  group: 'disrupt',
  order: 65,
  summary: '相手の永続効果を1つ消す',
  targetRule: 'enemyPlayer',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '相手の永続効果を1つ消す',
});
