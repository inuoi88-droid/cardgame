import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';
import { fromDiscardPoints } from './flashback.ts';

const B = BALANCE.abilities.retrace;

// 回顧：MTG #283。捨て札から、手札を1枚捨てて使える。使ったあとはまた捨て札へ（同じカードは1ターン1回）
export default defineAbility({
  id: 'retrace',
  name: '回顧',
  order: 35,
  group: '捨て札から',
  summary: `捨て札から、手札を1枚捨てて使える（コストは今の実コスト）。使ったあとはまた捨て札へ（同じカードは1ターン1回）。ポイントは効果・本体の合計×${B.rate}`,
  points: (_a, ctx) => fromDiscardPoints(ctx, B.rate, B.fromDiscardFlat).value,
  formula: (_a, ctx) => fromDiscardPoints(ctx, B.rate, B.fromDiscardFlat).formula,
  displayName: () => '回顧',
  describe: () => '捨て札から、手札1枚を捨てて使える（1ターン1回）',
  battle: { fromDiscard: { exileAfter: false, needsHandDiscard: true, oncePerTurn: true } },
});
