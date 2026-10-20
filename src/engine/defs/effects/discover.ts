import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.discover;

// 発見：MTG #553（呪文書からドラフト）。山札の上3枚を見て、1枚を選んで手札に加え、残りを捨て札に置く
export default defineEffect({
  id: 'discover',
  name: '発見',
  group: 'resource',
  order: 57.6,
  summary: `山札の上${B.look}枚を見て、1枚を選んで手札に加え（引いた扱い）、残りを捨て札に置く（選ぶカードは相手に見えない）`,
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `山札の上${B.look}枚から1枚を選んで手札に加え、残りを捨て札に置く`,
  battle: {
    choose(rt) {
      const top = rt.player(rt.controller).deck.slice(0, B.look);
      return {
        prompt: `山札の上${top.length}枚です。手札に加えるカードを1枚選んでください（残りは捨て札へ）`,
        options: top.map((c) => ({ id: c.uid, label: rt.cardName(c.cardId), cardId: c.cardId })),
        min: 1,
        max: 1,
      };
    },
    resolve(rt, _e, picks) {
      const top = rt.player(rt.controller).deck.slice(0, B.look).map((c) => c.uid);
      const pick = picks?.[0];
      if (pick && top.includes(pick)) rt.drawSpecific(rt.controller, pick);
      const rest = rt.player(rt.controller).deck.slice(0, B.look).filter((c) => top.includes(c.uid) && c.uid !== pick).map((c) => c.uid);
      rt.deckToDiscard(rt.controller, rest, '発見');
    },
  },
});
