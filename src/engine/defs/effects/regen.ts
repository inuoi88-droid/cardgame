import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.regen;

export default defineEffect({
  id: 'regen',
  name: '再生',
  group: 'buff',
  order: 44,
  summary: '再生Nを得る（ターン開始時にN回復し、その後Nが半分（切り捨て）になる）',
  value: valueParam('再生', { default: 1 }),
  targetRule: 'self',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `再生${n(e)}を得る`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.addStatus(t, 'regen', n(e));
    },
  },
});
