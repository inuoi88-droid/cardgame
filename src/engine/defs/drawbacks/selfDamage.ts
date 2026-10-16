import { BALANCE } from '../../balance.ts';
import { defineDrawback, n, valueParam } from '../../define.ts';

const B = BALANCE.drawbacks.selfDamage;

export default defineDrawback({
  id: 'selfDamage',
  name: '自傷',
  order: 1,
  summary: '自分にNダメージ',
  value: valueParam('ダメージ', { default: 2 }),
  basePoints: (d) => B.perValue * n(d),
  baseFormula: (d) => `${n(d)}×${B.perValue}`,
  describe: (d) => `自分に${n(d)}ダメージ`,
  battle: {
    resolve(rt, d) {
      rt.selfDamage(n(d));
    },
  },
});
