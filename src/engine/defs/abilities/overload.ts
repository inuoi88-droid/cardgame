import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n, type AbilityPointContext } from '../../define.ts';
import { round2 } from '../../math.ts';
import { overloadTarget, targetMultiplier } from '../../options.ts';

const B = BALANCE.abilities.overload;
const rate = (a: { value?: number }) => B.rate[Math.min(Math.max(n(a) - 1, 0), B.rate.length - 1)]!;

/** 「選んだ1体」の効果を全体にしたときに増えるポイント */
const gain = (ctx: AbilityPointContext) =>
  ctx.chosenEffects.reduce((s, x) => s + Math.max(0, targetMultiplier(overloadTarget(x.rule), x.rule) / targetMultiplier('chosen', x.rule) - 1) * x.points, 0);

// 超過：MTG #298。エナジー K を追加で払うと、「選んだ1体」の効果が全体になる
export default defineAbility({
  id: 'overload',
  name: '超過',
  order: 24,
  group: '追加の支払い',
  summary: `アタック・スキル：エナジーを追加でK払うと、使用時の「選んだ1体」の効果が全体（相手なら相手モンスター全体、自分なら自分のモンスター全体）になる。対象は選ばない（レア以上）。ポイントは（全体の倍率−1）×その効果×${B.rate.join('／')}（K＝1〜3）`,
  value: countParam('追加エナジー', { min: 1, max: B.rate.length, default: 1 }),
  cardTypes: ['attack', 'skill'],
  minRarity: 'rare',
  payGroup: 'extra',
  requiresChosen: 'any',
  points: (a, ctx) => gain(ctx) * rate(a),
  formula: (a, ctx) => `全体にして増える分${round2(gain(ctx))}×${rate(a)}`,
  displayName: (a) => `超過+${n(a)}`,
  describe: (a) => `エナジーを追加で${n(a)}払うと、「選んだ1体」が全体になる`,
  battle: { alt: { kind: 'overload', cost: (a, printed) => printed + n(a) } },
});
