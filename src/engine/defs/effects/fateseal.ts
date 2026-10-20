import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.fateseal;

// 消術：MTG #434（消術を行う）。相手の山札の上N枚を見て、好きな枚数を山札の下に置く（相手の占術）
export default defineEffect({
  id: 'fateseal',
  name: '消術',
  group: 'disrupt',
  order: 74.9,
  summary: '相手の山札の上N枚を見て、好きな枚数を山札の下に置く（残りは同じ順のまま。見たカードは自分だけに見える）',
  value: countParam('枚数', { default: 2, max: B.maxCount }),
  targetRule: 'enemyPlayer',
  basePoints: (e) => B.perCount * n(e),
  baseFormula: (e) => `${n(e)}×${B.perCount}`,
  describe: (e) => `相手の山札の上${n(e)}枚を見て、好きな枚数を山札の下に置く`,
  battle: {
    choose(rt, e) {
      const top = rt.player(rt.opponent).deck.slice(0, n(e));
      if (top.length === 0) return null;
      return {
        prompt: `相手の山札の上${top.length}枚です。山札の下に置くカードを選んでください（選ばなかったカードはそのままの順で残ります）`,
        options: top.map((c) => ({ id: c.uid, label: rt.cardName(c.cardId), cardId: c.cardId })),
        min: 0,
        max: top.length,
      };
    },
    resolve(rt, _e, picks) {
      if (rt.player(rt.opponent).deck.length === 0) {
        rt.log('相手の山札がないので何も起きない');
        return;
      }
      if (!picks || picks.length === 0) {
        rt.log('相手の山札の上はそのままにした');
        return;
      }
      rt.deckToBottomQuiet(rt.opponent, picks);
    },
  },
});
