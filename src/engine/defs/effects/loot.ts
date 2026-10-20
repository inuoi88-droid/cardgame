import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.loot;

// 手札整理：MTG #454・#631・#171。N 枚引いてから、手札を1枚選んで捨てる
export default defineEffect({
  id: 'loot',
  name: '手札整理',
  group: 'resource',
  order: 58,
  summary: 'カードをN枚引き、そのあと手札を1枚選んで捨てる（捨てても何も起きない）',
  value: countParam('枚数', { default: 1, max: B.maxValue }),
  targetRule: 'self',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `カードを${n(e)}枚引き、手札を1枚選んで捨てる`,
  battle: {
    resolve(rt, e) {
      rt.draw(rt.controller, n(e));
      rt.chooseDiscard(rt.controller, 1);
    },
  },
});
