import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';

const B = BALANCE.abilities.emerge;

// 現出：MTG #249・#322（献身・現出）。使うとき自分のモンスター1体を生け贄にしてよく、そのモンスターの印刷コストぶん安くなる
export default defineAbility({
  id: 'emerge',
  name: '現出',
  order: 26,
  group: '追加の支払い',
  summary: `手札から使うとき、自分のモンスター1体を生け贄にしてよい。そのモンスターの印刷コストぶん（トークンは0）このカードのコストが下がる（献身・現出）。印刷コスト${B.minCost}以上のカードだけ`,
  payGroup: 'sacrifice',
  minPrintedCost: B.minCost,
  points: () => B.flat,
  formula: () => `${B.flat}（固定）`,
  displayName: () => '現出',
  describe: () => '自分のモンスターを生け贄にすると、そのコストぶん安くなる',
  battle: { sacrifice: { kind: 'emerge' } },
});
