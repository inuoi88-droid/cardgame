import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.damage;

export default defineEffect({
  id: 'damage',
  name: 'ダメージ',
  group: 'damage',
  order: 10,
  summary: 'N点ダメージを与える',
  value: valueParam('ダメージ', { default: 2 }),
  targetRule: 'enemyAny',
  isDamage: true,
  allowsMods: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}に${c.modPrefix}${n(e)}ダメージを与える${c.modSuffix}`,
});
