import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.betrayal;

export default defineDrawback({
  id: 'betrayal',
  name: '裏切り',
  order: 10,
  summary: `召喚から${B.turns}ターン後、自分のプレイヤーを攻撃するようになる（モンスター専用・倍率込みの固定値。攻撃力が高いほど大きい）`,
  monsterOnly: true,
  fixed: true,
  basePoints: (_d, c) => B.fixed + B.perAttack * (c.stats?.attack ?? 0),
  baseFormula: (_d, c) => `${B.fixed}+攻撃力${c.stats?.attack ?? 0}×${B.perAttack}（固定）`,
  describe: () => `召喚から${B.turns}ターン後、自分のプレイヤーを攻撃するようになる`,
  battle: {
    onBoardTurnStart(rt, _d, m) {
      if (m.betraying) return;
      m.counters.betrayal = (m.counters.betrayal ?? 0) + 1;
      if (m.counters.betrayal >= B.turns) {
        m.betraying = true;
        rt.log(`「${rt.cardName(m.card.cardId)}」が裏切った（以後、持ち主を攻撃する）`);
      }
    },
  },
});
