import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.energy;

export default defineEffect({
  id: 'energy',
  name: 'エナジー',
  group: 'resource',
  order: 51,
  summary: 'このターンのエナジー+N',
  value: valueParam('エナジー', { default: 1, max: B.maxValue }),
  targetRule: 'self',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `エナジーを${n(e)}得る`,
});
