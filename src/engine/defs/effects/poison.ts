import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.poison;

export default defineEffect({
  id: 'poison',
  name: '毒',
  group: 'status',
  order: 30,
  summary: '毒Nを与える（ターン開始時に毒の数だけダメージ。その後1減る）',
  value: valueParam('毒', { default: 1 }),
  targetRule: 'enemyAny',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}に毒${n(e)}を与える`,
});
