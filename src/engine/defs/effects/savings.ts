import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.savings;

export default defineEffect({
  id: 'savings',
  name: '貯金',
  group: 'resource',
  order: 52,
  summary: '次のターンのエナジー+N',
  value: valueParam('エナジー', { default: 1 }),
  targetRule: 'self',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `次のターン、エナジー+${n(e)}`,
});
