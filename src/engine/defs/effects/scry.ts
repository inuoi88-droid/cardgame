import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n, optionOf } from '../../define.ts';

const B = BALANCE.effects.scry;
const option = {
  label: '置き場所',
  choices: [
    { id: 'bottom', label: '山札の下へ' },
    { id: 'discard', label: '捨て札へ' },
  ],
  default: 'bottom',
};
const toDiscard = (e: { option?: string }) => optionOf({ option }, e) === 'discard';
const where = (e: { option?: string }) => (toDiscard(e) ? '捨て札' : '山札の下');

// 占術：MTG #426・#429。山札の上 N 枚を見て、好きな枚数を山札の下（または捨て札）に置く
export default defineEffect({
  id: 'scry',
  name: '占術',
  group: 'resource',
  order: 57,
  summary: '山札の上N枚を見て、好きな枚数を山札の下（選択肢によっては捨て札）に置く。残りは同じ順のまま',
  value: countParam('枚数', { default: 2, max: B.maxValue }),
  option,
  targetRule: 'self',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `山札の上${n(e)}枚を見て、好きな枚数を${where(e)}に置く`,
  shortValue: (e) => `${n(e)}${toDiscard(e) ? '（捨て札へ）' : ''}`,
  battle: {
    choose(rt, e) {
      const top = rt.player(rt.controller).deck.slice(0, n(e));
      return {
        prompt: `山札の上${top.length}枚です。${where(e)}に置くカードを選んでください（選ばなかったカードはそのままの順で残ります）`,
        options: top.map((c) => ({ id: c.uid, label: rt.cardName(c.cardId), cardId: c.cardId })),
        min: 0,
        max: top.length,
      };
    },
    resolve(rt, e, picks) {
      rt.scryMove(rt.controller, picks ?? [], toDiscard(e));
    },
  },
});
