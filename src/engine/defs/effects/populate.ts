import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';
import { ARMY_CARD_ID } from '../../battle/types.ts';

const B = BALANCE.effects.populate;

// 居住：MTG #441（居住を行う）。自分のトークン1体を選び、同じ強さのトークンをもう1体出す（軍団は選べない）
export default defineEffect({
  id: 'populate',
  name: '居住',
  group: 'buff',
  order: 45.6,
  summary: '自分のトークン1体を選び、同じ（出たときの）強さのトークンをもう1体出す。複写トークンなら召喚時の効果も出る（軍団は選べない）',
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '自分のトークン1体のコピーを出す',
  battle: {
    choose(rt) {
      return {
        prompt: 'コピーする自分のトークンを選んでください',
        options: rt
          .player(rt.controller)
          .board.filter((m) => m.card.token && m.card.cardId !== ARMY_CARD_ID)
          .map((m) => ({ id: m.uid, label: rt.cardName(m.card.cardId), cardId: m.card.cardId })),
        min: 1,
        max: 1,
      };
    },
    resolve(rt, _e, picks) {
      const m = picks?.[0] ? rt.monster({ kind: 'monster', uid: picks[0] }) : undefined;
      if (!m?.card.token || m.controller !== rt.controller) return;
      rt.createToken(rt.controller, m.card.cardId, { ...m.card.token });
    },
  },
});
