import { BALANCE } from '../../balance.ts';
import { defineAbility, n, valueParam } from '../../define.ts';

const B = BALANCE.abilities.unleash;

// 解鎖：MTG #300。モンスター：出すとき、攻撃力+N して「反撃しない」状態で出してもよい
export default defineAbility({
  id: 'unleash',
  name: '解鎖',
  order: 25,
  group: '追加の支払い',
  summary: `モンスター：出すとき、攻撃力+Nで出してもよい。そのときは攻撃されても反撃しない（場を離れるまで）。ポイントはN×${B.perValue}`,
  value: valueParam('攻撃力', { min: B.minValue, max: B.maxValue, default: 1 }),
  cardTypes: ['monster'],
  payGroup: 'extra',
  points: (a) => B.perValue * n(a),
  formula: (a) => `${n(a)}×${B.perValue}`,
  displayName: (a) => `解鎖${n(a)}`,
  describe: (a) => `攻撃力+${n(a)}で出せるが、そのときは反撃しない`,
  battle: { alt: { kind: 'unleash', cost: (_a, printed) => printed } },
});
