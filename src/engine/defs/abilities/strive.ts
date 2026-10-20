import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n, type AbilityPointContext } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.strive;
const rate = (a: { value?: number }) => B.rate[Math.min(Math.max(n(a) - 1, 0), B.rate.length - 1)]!;
/** 「選んだ1体（相手）」の効果のポイントの合計 */
const enemyChosen = (ctx: AbilityPointContext) => ctx.chosenEffects.filter((x) => x.rule === 'enemyAny' || x.rule === 'enemyMonster' || x.rule === 'enemyMonsterOne').reduce((s, x) => s + x.points, 0);

// 奮励：MTG #528。エナジー K を追加で払うたび、「選んだ1体（相手）」の効果がランダムな別の相手モンスター1体にも出る
export default defineAbility({
  id: 'strive',
  name: '奮励',
  order: 20,
  group: '追加の支払い',
  summary: `使うときエナジーを追加でK払うたび（${B.maxTimes}回まで）、「選んだ1体（相手）」の効果が、ランダムな別の相手モンスター1体にも出る（レア以上）。ポイントは相手を選ぶ効果×${B.rate.join('／')}（K＝1／2）`,
  value: countParam('追加エナジー', { min: 1, max: B.maxCost, default: 1 }),
  minRarity: 'rare',
  payGroup: 'extra',
  requiresChosen: 'enemy',
  points: (a, ctx) => enemyChosen(ctx) * rate(a),
  formula: (a, ctx) => `相手を選ぶ効果${round2(enemyChosen(ctx))}×${rate(a)}`,
  displayName: (a) => `奮励+${n(a)}`,
  describe: (a) => `エナジーを追加で${n(a)}払うたび（${B.maxTimes}回まで）、相手モンスター1体を追加（ランダム）`,
  battle: { extraPay: { kind: 'strive', unit: (a) => n(a), max: B.maxTimes } },
});
