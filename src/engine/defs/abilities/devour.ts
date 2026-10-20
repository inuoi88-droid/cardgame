import { BALANCE } from '../../balance.ts';
import { defineAbility, n, valueParam } from '../../define.ts';

const B = BALANCE.abilities.devour;

// 貪食：MTG #284。モンスター：出たとき、自分の他のモンスターを好きな数（最大3体）生け贄にしてよい。1体につき攻撃力と体力+N
export default defineAbility({
  id: 'devour',
  name: '貪食',
  order: 29,
  group: '追加の支払い',
  summary: `モンスター：出たとき（召喚時の効果より先に）、自分の他のモンスターを0〜${B.max}体生け贄にしてよい。1体につき攻撃力と体力+N。ポイントは${B.base}＋N×${B.perValue}`,
  value: valueParam('量', { min: B.minValue, max: B.maxValue, default: 1 }),
  cardTypes: ['monster'],
  points: (a) => B.base + B.perValue * n(a),
  formula: (a) => `${B.base}＋${n(a)}×${B.perValue}`,
  displayName: (a) => `貪食${n(a)}`,
  describe: (a) => `出たとき、自分の他のモンスターを${B.max}体まで生け贄にしてよい。1体につき攻撃力と体力+${n(a)}`,
  battle: { devour: (a) => n(a) },
});
