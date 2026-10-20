import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';
import { CONDITIONS } from '../../options.ts';

const B = BALANCE.abilities.quest;
const cond = (a: { condition?: keyof typeof CONDITIONS }) => (a.condition && CONDITIONS[a.condition] ? CONDITIONS[a.condition].label : '（条件を選んでください）');

// 事件：MTG #64・#377（事件・解明完了）。パワーのカードに達成条件を付ける。持ち主のターン終了時に満たしていれば解明（達成）する
export default defineAbility({
  id: 'quest',
  name: '事件',
  order: 60,
  group: '達成・Lv・忠誠',
  summary: `パワーのカードに解明条件（達成条件）を付ける：持ち主のターン終了時に条件を満たしていれば解明し（1回きり・公開）、以後「達成していれば」の効果が働き、「達成したとき」の効果が出る。ポイントは固定${B.flat}（条件の重さは効果の倍率で払う）`,
  cardTypes: ['power', 'powerAttack'],
  conflicts: ['trap', 'levelUp', 'loyalty', 'emblem', 'altWin'],
  noSaga: true,
  achieveCondition: true,
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '事件',
  describe: (a) => `事件（解明条件：${cond(a)}。ターン終了時に判定）`,
  battle: { achieve: { kind: 'quest' } },
});
