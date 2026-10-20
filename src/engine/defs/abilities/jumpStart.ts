import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';
import { fromDiscardPoints } from './flashback.ts';

const B = BALANCE.abilities.jumpStart;

// 再活：MTG #341。捨て札から、手札を1枚捨てて使える。使ったら除外
export default defineAbility({
  id: 'jumpStart',
  name: '再活',
  order: 6,
  summary: `捨て札から、手札を1枚捨てて使える（コストは今の実コスト）。使ったあとは除外。手札が無いと使えない。ポイントは効果・本体の合計×${B.rate}`,
  conflicts: ['flashback', 'escape', 'exhaust'],
  points: (_a, ctx) => fromDiscardPoints(ctx, B.rate, B.fromDiscardFlat).value,
  formula: (_a, ctx) => fromDiscardPoints(ctx, B.rate, B.fromDiscardFlat).formula,
  displayName: () => '再活',
  describe: () => '捨て札から、手札を1枚捨てて使える。使ったら除外',
  battle: { fromDiscard: { exileAfter: true, needsHandDiscard: true } },
});
