import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.cleave;
const rate = (a: { value?: number }) => B.rate[Math.min(Math.max(n(a) - 1, 0), B.rate.length - 1)]!;

// 切除：MTG #356。エナジー K を追加で払うと、このカードの効果の条件を無視する
export default defineAbility({
  id: 'cleave',
  name: '切除',
  order: 19,
  group: '追加の支払い',
  summary: `使うときエナジーを追加でK払うと、このカードの使用時・召喚時の効果の条件を無視する（条件なしで出る）。ポイントは条件付きの効果ごとに（条件なし−条件付き）×${B.rate.join('／')}（K＝1／2）`,
  value: countParam('追加エナジー', { min: 1, max: B.maxCost, default: 1 }),
  payGroup: 'extra',
  conflicts: ['kicker'],
  points: (a, ctx) => ctx.conditionalGain * rate(a),
  formula: (a, ctx) => `条件を外した差${round2(ctx.conditionalGain)}×${rate(a)}`,
  displayName: (a) => `切除+${n(a)}`,
  describe: (a) => `エナジーを追加で${n(a)}払うと、条件を無視する`,
  battle: { extraPay: { kind: 'cleave', unit: (a) => n(a), max: 1 } },
});
