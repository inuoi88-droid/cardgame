import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.weak;

export default defineEffect({
  id: 'weak',
  name: '弱体',
  group: 'status',
  order: 33,
  summary: `Nターンの間、与えるダメージ−${BALANCE.battle.weakRate * 100}%`,
  value: valueParam('ターン数', { default: 1 }),
  targetRule: 'enemyAny',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}に弱体（${n(e)}ターン）を与える`,
  shortValue: (e) => `${n(e)}ターン`,
});
