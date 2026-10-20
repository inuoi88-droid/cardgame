import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.amass;
const army = BALANCE.battle.armyName;

// 動員：MTG #451（動員を行う）。自分の「軍団」トークンの攻撃力と体力+N。軍団がいなければ攻撃力0・体力0で出してから強化
export default defineEffect({
  id: 'amass',
  name: '動員',
  group: 'buff',
  order: 45.7,
  summary: `自分の「${army}」トークンの攻撃力と体力+N。${army}がいなければ攻撃力0・体力0で出してから強化（${army}は1人${BALANCE.battle.maxArmy}体・トークンの上限に数える）`,
  value: valueParam('量', { default: 1, max: B.maxValue }),
  targetRule: 'self',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `動員${n(e)}（${army}がいなければ出し、${army}の攻撃力と体力を+${n(e)}する）`,
  battle: {
    resolve(rt, e) {
      rt.amass(rt.controller, n(e));
    },
  },
});
