import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.strength;

export default defineEffect({
  id: 'strength',
  name: '筋力',
  group: 'buff',
  order: 40,
  summary: '以後ずっと、自分のアタックのダメージ+N',
  value: valueParam('筋力', { default: 1 }),
  targetRule: 'self',
  isPlayerPermanent: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `筋力+${n(e)}を得る（以後ずっと、アタックのダメージ+${n(e)}）`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.addStatus(t, 'strength', n(e));
    },
  },
});
