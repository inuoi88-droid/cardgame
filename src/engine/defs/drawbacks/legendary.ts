import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.legendary;

// 伝説：MTG #17。自分の場に同じ名前のモンスター（パワーのカードならパワー）があると使えない
export default defineDrawback({
  id: 'legendary',
  name: '伝説',
  order: 16,
  summary: '自分の場に同じ名前のモンスター（パワーのカードならパワー）があると使えない（モンスターとパワーのカードだけ・倍率込みの固定値）',
  cardTypes: ['monster', 'power', 'powerAttack'],
  fixed: true,
  basePoints: () => B.fixed,
  baseFormula: () => `${B.fixed}（固定）`,
  describe: () => '伝説（自分の場に同じ名前のものがあると使えない）',
  battle: {
    canPlay(g, p, card) {
      const def = g.cards[card.cardId];
      if (!def) return null;
      const ps = g.players[p];
      if (def.stats) {
        return ps.board.some((m) => g.cards[m.card.cardId]?.name === def.name) ? `伝説：同じ名前のモンスター「${def.name}」が場にあります` : null;
      }
      return ps.powers.some((pw) => pw.name === def.name) ? `伝説：同じ名前のパワー『${def.name}』が場にあります` : null;
    },
  },
});
