import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n, optionOf } from '../../define.ts';

const B = BALANCE.effects.mill;
const option = {
  label: '山札',
  choices: [
    { id: 'self', label: '自分の山札' },
    { id: 'enemy', label: '相手の山札' },
  ],
  default: 'enemy',
};
const isSelf = (e: { option?: string }) => optionOf({ option }, e) === 'self';

// 切削：MTG #318・#421（嚥下・切削する）。山札の上N枚を捨て札に置く
export default defineEffect({
  id: 'mill',
  name: '切削',
  group: 'resource',
  order: 57.5,
  summary: '山札の上N枚を捨て札に置く（自分：捨て札を増やす燃料に／相手：山札の上を崩す）。足りなければある分だけ（切り直さない）',
  value: countParam('枚数', { default: 2, max: B.maxValue }),
  option,
  targetRule: 'self',
  scalable: true,
  basePoints: (e) => (isSelf(e) ? B.selfPerValue : B.enemyPerValue) * n(e),
  baseFormula: (e) => `${n(e)}×${isSelf(e) ? B.selfPerValue : B.enemyPerValue}`,
  describe: (e) => `${isSelf(e) ? '自分の' : '相手の'}山札の上${n(e)}枚を捨て札に置く`,
  shortValue: (e) => `${n(e)}（${isSelf(e) ? '自分' : '相手'}）`,
  battle: {
    resolve(rt, e) {
      const p = isSelf(e) ? rt.controller : rt.opponent;
      const top = rt.player(p).deck.slice(0, n(e)).map((c) => c.uid);
      if (top.length === 0) {
        rt.log('山札がないので、何も置かない');
        return;
      }
      rt.deckToDiscard(p, top, '切削');
    },
  },
});
