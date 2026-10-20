import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n, type AbilityPointContext } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.squad;
const rate = (a: { value?: number }) => B.rate[Math.min(Math.max(n(a) - B.minCost, 0), B.rate.length - 1)]!;
const body = (ctx: AbilityPointContext) => ctx.bodyPoints + ctx.effectPoints;

// 分隊：MTG #365。モンスター：エナジー K を追加で払うたび、出たときにこのモンスターのコピー（トークン）を1体出す
export default defineAbility({
  id: 'squad',
  name: '分隊',
  order: 21,
  group: '追加の支払い',
  summary: `モンスター：手札から使うときエナジーを追加でK払うたび（${B.maxTimes}回まで）、出たあとこのモンスターのコピー（トークン。召喚時の効果も出る）を1体出す（レア以上）。ポイントは本体（ステータス・キーワード・効果）×${B.rate.join('／')}（K＝${B.minCost}〜${B.maxCost}）`,
  value: countParam('追加エナジー', { min: B.minCost, max: B.maxCost, default: B.minCost }),
  cardTypes: ['monster'],
  minRarity: 'rare',
  payGroup: 'extra',
  points: (a, ctx) => body(ctx) * rate(a),
  formula: (a, ctx) => `本体${round2(body(ctx))}×${rate(a)}`,
  displayName: (a) => `分隊+${n(a)}`,
  describe: (a) => `エナジーを追加で${n(a)}払うたび（${B.maxTimes}回まで）、コピーを1体出す`,
  battle: { extraPay: { kind: 'squad', unit: (a) => n(a), max: B.maxTimes } },
});
