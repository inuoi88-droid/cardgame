import { BALANCE } from '../../balance.ts';
import { defineAbility, n, valueParam } from '../../define.ts';
import { CONDITIONS } from '../../options.ts';

const B = BALANCE.abilities.evolve;
const cond = (a: { condition?: keyof typeof CONDITIONS }) => (a.condition && CONDITIONS[a.condition] ? CONDITIONS[a.condition].label : '（条件を選んでください）');

// 進化：MTG #56・#57（反転カード・変身する両面カード）。モンスター：ターン終了時に達成条件を満たしていれば進化し、攻撃力と体力+N（一方通行）
export default defineAbility({
  id: 'evolve',
  name: '進化',
  order: 61,
  group: '達成・Lv・忠誠',
  summary: `モンスター：持ち主のターン終了時に進化条件（達成条件）を満たしていれば進化し（1回きり・公開）、攻撃力と体力+N。以後「達成していれば」の効果が働き、「達成したとき」の効果が出る（反転・変身のアレンジ。封印中は進化しない）。ポイントは${B.flat}＋N×${B.perValue}`,
  value: valueParam('強さ', { min: B.minValue, max: B.maxValue, default: 1 }),
  cardTypes: ['monster'],
  achieveCondition: true,
  points: (a) => B.flat + n(a) * B.perValue,
  formula: (a) => `${B.flat}＋${n(a)}×${B.perValue}`,
  displayName: (a) => `進化${n(a)}`,
  describe: (a) => `進化条件：${cond(a)}（ターン終了時に判定。進化すると攻撃力・体力+${n(a)}）`,
  battle: { achieve: { kind: 'evolve', amount: (a) => n(a) } },
});
