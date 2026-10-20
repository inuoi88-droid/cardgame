import { BALANCE } from '../../balance.ts';
import { defineAbility, n, valueParam } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.casualty;
const rate = (a: { value?: number }) => B.rate[Math.min(Math.max(Math.round(n(a) / BALANCE.amountScale) - 1, 0), B.rate.length - 1)]!;

// 犠牲：MTG #361。使うとき攻撃力 N 以上の自分のモンスター1体を生け贄にしてよい。そうしたら使用時の効果がもう一度出る
export default defineAbility({
  id: 'casualty',
  name: '犠牲',
  order: 27,
  group: '追加の支払い',
  summary: `アタック・スキル：使うとき攻撃力N以上の自分のモンスター1体を生け贄にしてよい。そうしたら使用時の効果がもう一度出る（同じ対象。続唱はもう一度出ない）。ポイントは使用時の効果×${B.rate.join('／')}（N＝${B.minValue}〜${B.maxValue}）`,
  value: valueParam('攻撃力', { min: B.minValue, max: B.maxValue, default: 1 }),
  cardTypes: ['attack', 'skill'],
  payGroup: 'sacrifice',
  points: (a, ctx) => ctx.playEffectPoints * rate(a),
  formula: (a, ctx) => `使用時の効果${round2(ctx.playEffectPoints)}×${rate(a)}`,
  displayName: (a) => `犠牲${n(a)}`,
  describe: (a) => `攻撃力${n(a)}以上の自分のモンスターを生け贄にすると、使用時の効果がもう一度出る`,
  battle: { sacrifice: { kind: 'casualty', minAttack: (a) => n(a) } },
});
