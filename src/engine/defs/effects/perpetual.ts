import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';
import { NOISE_CARD_ID } from '../../battle/types.ts';

const B = BALANCE.effects.perpetual;

// 永久強化：MTG #549（永久に）。手札のモンスターカード1枚の攻撃力と体力を、この試合のあいだ+N（どこに移っても残る）
export default defineEffect({
  id: 'perpetual',
  name: '永久強化',
  group: 'buff',
  order: 75,
  summary: `手札のモンスターカード1枚を選び、この試合のあいだ攻撃力と体力+N（山札・捨て札・除外を巡っても残る。1枚につきそれぞれ+${B.cardCap}まで。強化したカードは自分だけに見える）`,
  value: valueParam('上昇量', { default: 1, max: B.maxValue }),
  targetRule: 'self',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `手札のモンスターカード1枚の攻撃力と体力を、この試合のあいだ+${n(e)}する`,
  battle: {
    choose(rt) {
      const cards = rt.player(rt.controller).hand.filter((c) => c.uid !== rt.src.uid && c.cardId !== NOISE_CARD_ID && rt.cardDef(c.cardId)?.stats);
      if (cards.length === 0) return null;
      return {
        prompt: '永久強化する手札のモンスターカードを選んでください',
        options: cards.map((c) => ({ id: c.uid, label: rt.cardName(c.cardId), cardId: c.cardId })),
        min: 1,
        max: 1,
      };
    },
    resolve(rt, e, picks) {
      const uid = picks?.[0];
      if (!uid) {
        rt.log('手札にモンスターカードがないので何も起きない');
        return;
      }
      rt.perpetual(rt.controller, uid, n(e));
    },
  },
});
