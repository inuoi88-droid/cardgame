import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.warp;

// ワープ：MTG #393。モンスター：エナジー K で出せる。そのときは自分のターン終了時に待機ゾーンへ移り、後のターンに普通のコストで出し直せる
export default defineAbility({
  id: 'warp',
  name: 'ワープ',
  order: 53,
  group: '待機ゾーン',
  summary: `モンスター：エナジーK（印刷コスト未満）で出してもよい。そのときは自分のターン終了時に待機ゾーンへ移り（いっぱいなら手札へ）、後の自分のターンに普通のコストで出し直せる（召喚時の効果がまた出る）。ポイントは${B.flat}＋召喚時の効果×${B.summonRate}`,
  value: countParam('エナジー', { min: 1, max: B.maxCost, default: 1 }),
  cardTypes: ['monster'],
  payGroup: 'extra',
  belowPrintedCost: 'value',
  points: (_a, ctx) => B.flat + ctx.playEffectPoints * B.summonRate,
  formula: (_a, ctx) => `${B.flat}＋召喚時の効果${round2(ctx.playEffectPoints)}×${B.summonRate}`,
  displayName: (a) => `ワープ${n(a)}`,
  describe: (a) => `エナジー${n(a)}で出すと、ターン終了時に待機ゾーンへ（後で出し直せる）`,
  battle: { alt: { kind: 'warp', cost: (a) => n(a) } },
});
