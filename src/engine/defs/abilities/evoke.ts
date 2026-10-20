import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.evoke;

// 想起：MTG #276。モンスター：想起コスト E で使うと、召喚時の効果が出たあとすぐ破壊される
export default defineAbility({
  id: 'evoke',
  name: '想起',
  order: 23,
  group: '追加の支払い',
  summary: `モンスター：想起コストE（印刷コスト未満）で使ってもよい。そのときは召喚時の効果が出たあとすぐ破壊される（効果だけ使う）。ポイントは召喚時の効果×${B.rate}`,
  value: countParam('想起コスト', { min: 0, max: B.maxCost, default: 1 }),
  cardTypes: ['monster'],
  payGroup: 'extra',
  points: (_a, ctx) => ctx.playEffectPoints * B.rate,
  formula: (_a, ctx) => `召喚時の効果${round2(ctx.playEffectPoints)}×${B.rate}`,
  displayName: (a) => `想起${n(a)}`,
  describe: (a) => `エナジー${n(a)}で出すと、召喚時の効果のあと破壊される`,
  battle: { alt: { kind: 'evoke', cost: (a) => n(a) } },
});
