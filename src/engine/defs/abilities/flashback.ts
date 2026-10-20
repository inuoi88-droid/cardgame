import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n, type AbilityPointContext } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.flashback;

/**
 * 捨て札から使う能力（フラッシュバック・再活・脱出）のポイントの元：このカードの効果（魂力を除く）・ステータス・キーワードの合計×率。
 * 「捨て札から使ったとき」の効果があるカードは、その効果を別に数えているので、ステータス・キーワードだけ×率＋固定
 */
export function fromDiscardPoints(ctx: AbilityPointContext, rate: number, flat: number): { value: number; formula: string } {
  if (ctx.hasFromDiscard) {
    const body = round2(ctx.bodyPoints);
    return { value: ctx.bodyPoints * rate + flat, formula: body > 0 ? `本体${body}×${rate}＋${flat}` : `${flat}（固定。捨て札から使ったときの効果は別）` };
  }
  const total = ctx.effectPoints - ctx.channelEffectPoints + ctx.bodyPoints;
  return { value: total * rate, formula: `効果・本体${round2(total)}×${rate}` };
}

const rate = (a: { value?: number }) => B.rateByExtra[Math.min(Math.max(n(a), 0), B.rateByExtra.length - 1)]!;

// フラッシュバック：MTG #234。捨て札から、コスト+N で使える。使ったら除外（モンスターなら場を離れるとき除外）
export default defineAbility({
  id: 'flashback',
  name: 'フラッシュバック',
  order: 5,
  group: '捨て札から',
  summary: `捨て札から使える（コストは今の実コスト＋N）。使ったあとは除外（モンスターなら場を離れるとき除外）。ポイントは効果・本体の合計×${B.rateByExtra.join('／')}（N＝0／1／2）`,
  value: countParam('追加コスト', { min: 0, max: B.maxExtra, default: 0 }),
  conflicts: ['jumpStart', 'escape', 'exhaust'],
  points: (a, ctx) => fromDiscardPoints(ctx, rate(a), B.fromDiscardFlat).value,
  formula: (a, ctx) => fromDiscardPoints(ctx, rate(a), B.fromDiscardFlat).formula,
  displayName: (a) => (n(a) > 0 ? `フラッシュバック+${n(a)}` : 'フラッシュバック'),
  describe: (a) => `捨て札から使える${n(a) > 0 ? `（コスト+${n(a)}）` : ''}。使ったら除外`,
  battle: { fromDiscard: { exileAfter: true, extraCost: (a) => n(a) } },
});
