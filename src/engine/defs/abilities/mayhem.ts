import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';
import { fromDiscardPoints } from './flashback.ts';

const B = BALANCE.abilities.mayhem;

// 大混乱：MTG #395。このターンに手札から捨てられていれば、捨て札から使える
export default defineAbility({
  id: 'mayhem',
  name: '大混乱',
  order: 37,
  group: '捨て札から',
  summary: `このターンに手札から捨てられていれば（手札整理・サイクリング・魂力・再活／回顧の支払いなど。ターン終了時の手札の捨ては除く）、捨て札から使える（コストは今の実コスト）。ポイントは効果・本体の合計×${B.rate}`,
  points: (_a, ctx) => fromDiscardPoints(ctx, B.rate, B.fromDiscardFlat).value,
  formula: (_a, ctx) => fromDiscardPoints(ctx, B.rate, B.fromDiscardFlat).formula,
  displayName: () => '大混乱',
  describe: () => 'このターン捨てられていれば、捨て札から使える',
  battle: { fromDiscard: { exileAfter: false, onlyIfDiscardedThisTurn: true } },
});
