import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.regen;

export default defineEffect({
  id: 'regen',
  name: '再生',
  group: 'buff',
  order: 44,
  summary: '再生Nを得る（ターン開始時にN回復し、その後Nが1減る）',
  value: valueParam('再生', { default: 1 }),
  targetRule: 'self',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `再生${n(e)}を得る`,
});
