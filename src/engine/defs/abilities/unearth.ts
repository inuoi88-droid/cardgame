import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n, type AbilityPointContext } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.unearth;
const rate = (a: { value?: number }) => B.rate[Math.min(Math.max(n(a) - 1, 0), B.rate.length - 1)]!;
const body = (ctx: AbilityPointContext) => ctx.bodyPoints + ctx.playEffectPoints;

// 一時蘇生：MTG #286（蘇生）。モンスター：捨て札からエナジー K で出せる。疾走を持ち、自分のターン終了時に除外される
export default defineAbility({
  id: 'unearth',
  name: '一時蘇生',
  order: 38,
  group: '捨て札から',
  summary: `モンスター：捨て札からエナジーK（印刷コストの代わり）で出せる。疾走を持ち、自分のターン終了時に除外される（場を離れても除外）。ポイントは本体（ステータス・キーワード・召喚時の効果）×${B.rate.join('／')}（K＝1〜3）`,
  value: countParam('エナジー', { min: 1, max: B.rate.length, default: 1 }),
  cardTypes: ['monster'],
  points: (a, ctx) => body(ctx) * rate(a),
  formula: (a, ctx) => `本体${round2(body(ctx))}×${rate(a)}`,
  displayName: (a) => `一時蘇生${n(a)}`,
  describe: (a) => `捨て札からエナジー${n(a)}で出せる（疾走。ターン終了時に除外）`,
  battle: { fromDiscard: { exileAfter: true, fixedCost: (a) => n(a), unearth: true } },
});
