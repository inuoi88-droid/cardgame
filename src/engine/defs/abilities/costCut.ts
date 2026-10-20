import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';
import { CONDITIONS, conditionMultiplier } from '../../options.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.costCut;

const steps = (a: { value?: number }, cost: number | undefined) => Math.max(0, Math.min(n(a), (cost ?? 0) - B.minCost));
const condLabel = (a: { condition?: keyof typeof CONDITIONS }) => (a.condition && CONDITIONS[a.condition] ? CONDITIONS[a.condition].textPrefix : '（条件を選んでください）、');

// 条件付き軽減：MTG #320・#48（怒濤・罠）。条件を満たしているとき、このカードのコスト−K
export default defineAbility({
  id: 'costCut',
  name: '条件付き軽減',
  order: 12,
  summary: `条件を満たしているとき、このカードのコスト−K（コストは${B.minCost}まで。怒濤＝「このターン2枚目以降」、罠＝「前の相手のターンに相手が3枚以上使った」でKを印刷コストに）。ポイントは${B.perStep}×K×条件の倍率`,
  value: countParam('軽減', { min: 1, max: B.maxReduction, default: 1 }),
  takesCondition: true,
  points: (a, ctx) => B.perStep * steps(a, ctx.card.cost) * conditionMultiplier(a.condition ?? null),
  formula: (a, ctx) => `${B.perStep}×${steps(a, ctx.card.cost)}×${round2(conditionMultiplier(a.condition ?? null))}`,
  displayName: (a) => `条件付き軽減${n(a)}`,
  describe: (a) => `${condLabel(a)}コスト−${n(a)}`,
  battle: {
    reduce: (a, ctx) => (a.condition && ctx.check(a.condition) ? { amount: n(a), min: B.minCost } : null),
  },
});
