import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';
import { ceilPoints, round2 } from '../../math.ts';

const B = BALANCE.abilities.buyback;

// 再利用：MTG #225（バイバック）。使ったあと、捨て札ではなく手札に戻る（同じカードは1ターン1回まで）
export default defineAbility({
  id: 'buyback',
  name: '再利用',
  order: 2,
  group: '使い終わり',
  summary: '使ったあと、捨て札ではなく手札に戻る（同じカードは1ターン1回まで。2回目は捨て札へ）。ポイントは使用時の効果の合計×' + B.rate,
  cardTypes: ['attack', 'skill'],
  conflicts: ['shuffleBack', 'rebound', 'exhaust'],
  points: (_a, ctx) => ceilPoints(ctx.playEffectPoints * B.rate),
  formula: (_a, ctx) => `使用時の効果${round2(ctx.playEffectPoints)}×${B.rate}`,
  displayName: () => '再利用',
  describe: () => '使ったあと、手札に戻る（同じカードは1ターン1回）',
  battle: { afterUse: 'hand' },
});
