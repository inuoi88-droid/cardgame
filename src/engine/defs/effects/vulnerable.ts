import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.vulnerable;

export default defineEffect({
  id: 'vulnerable',
  name: '脆弱',
  group: 'status',
  order: 34,
  summary: `Nターンの間、受けるダメージ+${BALANCE.battle.vulnerableRate * 100}%`,
  value: valueParam('ターン数', { default: 1 }),
  targetRule: 'enemyAny',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}に脆弱（${n(e)}ターン）を与える`,
  shortValue: (e) => `${n(e)}ターン`,
});
