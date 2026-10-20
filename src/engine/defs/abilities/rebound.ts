import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';
import { ceilPoints, round2 } from '../../math.ts';

const B = BALANCE.abilities.rebound;

// 反復：MTG #290。手札から使ったあと除外され、次の自分のターン開始時に使用時の効果がもう一度出る。その後は捨て札へ
export default defineAbility({
  id: 'rebound',
  name: '反復',
  order: 3,
  group: '使い終わり',
  summary: `手札から使ったあと除外され、次の自分のターン開始時に使用時の効果がもう一度発動する（予約の1件。「選んだ1体」はランダム）。その後は捨て札へ。ポイントは使用時の効果の合計×${B.rate}`,
  cardTypes: ['attack', 'skill'],
  conflicts: ['shuffleBack', 'buyback', 'exhaust'],
  points: (_a, ctx) => ceilPoints(ctx.playEffectPoints * B.rate),
  formula: (_a, ctx) => `使用時の効果${round2(ctx.playEffectPoints)}×${B.rate}`,
  displayName: () => '反復',
  describe: () => '次の自分のターン開始時に、使用時の効果がもう一度発動する（対象はランダム）',
  battle: { afterUse: 'rebound' },
});
