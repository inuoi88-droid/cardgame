import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.discardRandom;

export default defineDrawback({
  id: 'discardRandom',
  name: '手札喪失',
  order: 4,
  summary: `自分の手札をランダムに${B.count}枚捨てる`,
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `自分の手札をランダムに${B.count}枚捨てる`,
  battle: {
    resolve(rt) {
      rt.discardRandom(rt.controller, B.count);
    },
  },
});
