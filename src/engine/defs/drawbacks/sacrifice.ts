import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.sacrifice;

// 生け贄：MTG #425・#597・#133。自分のモンスター1体を選んで破壊する（いなければ使えない）
export default defineDrawback({
  id: 'sacrifice',
  name: '生け贄',
  order: 15,
  summary: '自分のモンスター1体を選んで破壊する（自分の場にモンスターがいなければ使えない。使用時・召喚時だけ）',
  timings: ['play', 'summon'],
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '自分のモンスター1体を選んで破壊する（いなければ使えない）',
  battle: {
    canPlay(g, p) {
      return g.players[p].board.length === 0 ? '生け贄にするモンスターがいません' : null;
    },
    choose(rt) {
      // 召喚時なら、出たモンスター自身は選べない
      const self = rt.src.kind === 'monster' ? rt.src.uid : null;
      return {
        prompt: '生け贄にする（破壊する）自分のモンスターを選んでください',
        options: rt
          .player(rt.controller)
          .board.filter((m) => m.uid !== self)
          .map((m) => ({ id: m.uid, label: rt.cardName(m.card.cardId), cardId: m.card.cardId })),
        min: 1,
        max: 1,
      };
    },
    resolve(rt, _d, picks) {
      const uid = picks?.[0];
      const m = uid ? rt.monster({ kind: 'monster', uid }) : undefined;
      if (!m || m.controller !== rt.controller) {
        rt.log('生け贄にするモンスターがいない');
        return;
      }
      rt.destroy({ kind: 'monster', uid: m.uid });
    },
  },
});
