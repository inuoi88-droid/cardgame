import { BALANCE } from '../../balance.ts';
import { defineAbility, n, valueParam } from '../../define.ts';

const B = BALANCE.abilities.levelUp;
const max = BALANCE.battle.maxLevel;
const COSTS = Array.from({ length: B.maxCost }, (_, i) => ({ id: String(i + 1), label: `エナジー${i + 1}` }));
/** Lv を1上げるエナジー（選択肢の数字） */
export const levelCost = (a: { option?: string }): number => {
  const k = Number(a.option ?? '1');
  return Number.isInteger(k) && k >= 1 && k <= B.maxCost ? k : 1;
};

// Lvアップ：MTG #63・#159・#289（クラス・Lvカウンター・Lvアップ）。場にいる間、エナジー K で Lv を1上げる（Lv3まで・1ターン1回）
export default defineAbility({
  id: 'levelUp',
  name: 'Lvアップ',
  order: 62,
  group: '達成・Lv・忠誠',
  summary: `場にいる間（モンスター・パワー）、自分のターンにエナジーKを払って Lv を1上げる（Lv${max}まで・1ターン1回。カードを使ったことには数えない）。モンスターは1つにつき攻撃力と体力+N。「Lv2以上なら」「Lv${max}なら」「Lvが上がったとき」が使える（クラス）。ポイントはモンスター N×${B.perValue}、パワーは0（N は使わない）`,
  value: valueParam('強さ（モンスター）', { min: 0, max: B.maxValue, default: 1 }),
  option: { label: 'Lvを上げるエナジー', choices: COSTS, default: '1' },
  cardTypes: ['monster', 'power', 'powerAttack'],
  conflicts: ['quest', 'loyalty', 'emblem'],
  points: (a, ctx) => (ctx.card.stats ? n(a) * B.perValue : B.powerFlat),
  formula: (a, ctx) => (ctx.card.stats ? `${n(a)}×${B.perValue}` : '0（パワーは条件・タイミングの倍率で払う）'),
  displayName: (a) => `Lvアップ${levelCost(a)}`,
  describe: (a) => `エナジー${levelCost(a)}で Lv を1上げる（Lv${max}まで・1ターン1回。モンスターは1つにつき攻撃力・体力+${n(a)}）`,
  battle: { levelUp: { cost: (a) => levelCost(a), amount: (a) => n(a) } },
});
