import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n, optionOf } from '../../define.ts';

const B = BALANCE.effects.rad;
const cap = BALANCE.battle.radCap;
const option = {
  label: '対象',
  choices: [
    { id: 'enemy', label: '相手プレイヤー' },
    { id: 'self', label: '自分（自分の山札を削る燃料）' },
  ],
  default: 'enemy',
};
const isSelf = (e: { option?: string }) => optionOf({ option }, e) === 'self';

// 放射能：MTG #149（RADカウンター）。ターン開始時に山札の上を放射能の数だけ捨て札に置き、モンスター以外1枚ごとにダメージ
export default defineEffect({
  id: 'rad',
  name: '放射能',
  group: 'status',
  order: 74.1,
  summary: `放射能Nを与える。持ち主のターン開始時（引いた後）に山札の上を放射能の数だけ捨て札に置き、モンスター以外1枚ごとに${BALANCE.battle.radDamage}ダメージ（シールドを無視）。放射能はその枚数だけ減る（合計${cap}まで。浄化で消える）`,
  value: countParam('放射能', { default: 1, max: B.maxCount }),
  option,
  targetRule: 'self',
  basePoints: (e) => B.perCount * n(e),
  baseFormula: (e) => `${n(e)}×${B.perCount}`,
  describe: (e) => `${isSelf(e) ? '自分' : '相手'}に放射能${n(e)}を与える`,
  shortValue: (e) => `${n(e)}（${isSelf(e) ? '自分' : '相手'}）`,
  battle: {
    resolve(rt, e) {
      rt.addStatus({ kind: 'player', player: isSelf(e) ? rt.controller : rt.opponent }, 'rad', n(e));
    },
  },
});
