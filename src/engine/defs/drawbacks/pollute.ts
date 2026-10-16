import { BALANCE } from '../../balance.ts';
import { defineDrawback, n, valueParam } from '../../define.ts';

const B = BALANCE.drawbacks.pollute;

export default defineDrawback({
  id: 'pollute',
  name: '汚染',
  order: 6,
  summary: '自分の山札にノイズをN枚入れる',
  value: valueParam('枚数', { default: 1 }),
  basePoints: (d) => B.perValue * n(d),
  baseFormula: (d) => `${n(d)}×${B.perValue}`,
  describe: (d) => `自分の山札にノイズを${n(d)}枚入れる`,
  battle: {
    resolve(rt, d) {
      rt.addNoise(rt.controller, n(d));
    },
  },
});
