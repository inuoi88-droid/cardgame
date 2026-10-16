import { BALANCE } from '../../balance.ts';
import { defineDrawback, me, n, valueParam } from '../../define.ts';

const B = BALANCE.drawbacks.selfPoison;

export default defineDrawback({
  id: 'selfPoison',
  name: '自毒',
  order: 2,
  summary: '自分に毒N',
  value: valueParam('毒', { default: 2 }),
  basePoints: (d) => B.perValue * n(d),
  baseFormula: (d) => `${n(d)}×${B.perValue}`,
  describe: (d) => `自分に毒${n(d)}`,
  battle: {
    resolve(rt, d) {
      rt.addStatus(me(rt), 'poison', n(d));
    },
  },
});
