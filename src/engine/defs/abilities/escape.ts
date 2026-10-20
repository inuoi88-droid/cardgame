import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';
import { fromDiscardPoints } from './flashback.ts';

const B = BALANCE.abilities.escape;
const rate = (a: { value?: number }) => B.rateByCount[Math.min(Math.max(n(a) - B.minCount, 0), B.rateByCount.length - 1)]!;

// 脱出：MTG #346。捨て札から、他の捨て札を N 枚除外して使える。使ったあとはまた捨て札へ（何度でも）
export default defineAbility({
  id: 'escape',
  name: '脱出',
  order: 7,
  summary: `捨て札から、他の捨て札をN枚除外して使える（コストは今の実コスト）。使ったあとはまた捨て札へ（何度でも）。ポイントは効果・本体の合計×${B.rateByCount.join('／')}（N＝${B.minCount}〜${B.maxCount}）`,
  value: countParam('除外する枚数', { min: B.minCount, max: B.maxCount, default: 3 }),
  minRarity: 'rare',
  conflicts: ['flashback', 'jumpStart', 'exhaust'],
  points: (a, ctx) => fromDiscardPoints(ctx, rate(a), B.fromDiscardFlat).value,
  formula: (a, ctx) => fromDiscardPoints(ctx, rate(a), B.fromDiscardFlat).formula,
  displayName: (a) => `脱出${n(a)}`,
  describe: (a) => `捨て札から、他の捨て札を${n(a)}枚除外して使える（使ったあとはまた捨て札へ）`,
  battle: { fromDiscard: { exileAfter: false, exileOthers: (a) => n(a) } },
});
