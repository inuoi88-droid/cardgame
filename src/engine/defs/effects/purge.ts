import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.purge;

// 処分：MTG #417。手札か捨て札のカードを1枚選んで除外する（選ばなくてもよい）
export default defineEffect({
  id: 'purge',
  name: '処分',
  group: 'resource',
  order: 59,
  summary: '自分の手札か捨て札のカードを1枚選んで除外する（ノイズや呪いカードの処分に。選ばなくてもよい）',
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '手札か捨て札のカードを1枚選んで除外する',
  battle: {
    choose(rt) {
      const ps = rt.player(rt.controller);
      return {
        prompt: '除外するカードを選んでください（選ばなくてもかまいません）',
        options: [
          ...ps.hand.map((c) => ({ id: c.uid, label: `手札：${rt.cardName(c.cardId)}`, cardId: c.cardId })),
          ...ps.discard.map((c) => ({ id: c.uid, label: `捨て札：${rt.cardName(c.cardId)}`, cardId: c.cardId })),
        ],
        min: 0,
        max: 1,
      };
    },
    resolve(rt, _e, picks) {
      if (picks?.[0]) rt.exileCard(rt.controller, picks[0]);
    },
  },
});
