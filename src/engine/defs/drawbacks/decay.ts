import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.decay;

// 腐乱：MTG #355。攻撃したターンの終了時に破壊される
export default defineDrawback({
  id: 'decay',
  name: '腐乱',
  order: 13,
  summary: '攻撃したターンの終了時に破壊される（モンスター専用・倍率込みの固定値。攻撃力が高いほど大きい）',
  monsterOnly: true,
  fixed: true,
  basePoints: (_d, c) => Math.max(B.min, B.perAttack * (c.stats?.attack ?? 0)),
  baseFormula: (_d, c) => `max(${B.min}, 攻撃力${c.stats?.attack ?? 0}×${B.perAttack})（固定）`,
  describe: () => '攻撃したターンの終了時に破壊される',
  battle: {
    onBoardTurnEnd(rt, _d, m) {
      if (m.counters.attackedTurn !== rt.g.turnIndex) return;
      rt.log(`腐乱：「${rt.cardName(m.card.cardId)}」は攻撃したので崩れ落ちる`);
      rt.destroy({ kind: 'monster', uid: m.uid });
    },
  },
});
