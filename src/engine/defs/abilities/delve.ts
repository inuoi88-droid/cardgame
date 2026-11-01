import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';

const B = BALANCE.abilities.delve;

/** 下げられる量（印刷コストより下げられない） */
const steps = (cost: number | undefined) => Math.max(0, Math.min(B.max, cost ?? 0));

// 探査：MTG #268。使うとき自分の捨て札を除外すると、1枚につきコスト−1（最大−3）
export default defineAbility({
  id: 'delve',
  name: '探査',
  order: 31,
  group: 'コスト',
  summary: `手札から使うとき、自分の捨て札を除外すると、1枚につきコスト−1（最大−${B.max}）。印刷コスト${B.minCost}以上のカードだけ。脱出とは同時に付けられない`,
  minPrintedCost: B.minCost,
  points: (_a, ctx) => B.perStep * steps(ctx.card.cost),
  formula: (_a, ctx) => `${B.perStep}×${steps(ctx.card.cost)}`,
  displayName: () => '探査',
  describe: () => `捨て札を除外すると、1枚につきコスト−1（最大−${B.max}）`,
  battle: { delve: { max: B.max } },
});
