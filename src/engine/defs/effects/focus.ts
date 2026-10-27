import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.focus;

export default defineEffect({
  id: 'focus',
  name: '気合',
  group: 'buff',
  order: 41,
  summary: 'このターンだけ、アタックのダメージ+N',
  value: valueParam('上昇量', { default: 2, max: B.maxValue }),
  targetRule: 'self',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `このターン、アタックのダメージ+${n(e)}`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.addStatus(t, 'focus', n(e));
    },
  },
});
