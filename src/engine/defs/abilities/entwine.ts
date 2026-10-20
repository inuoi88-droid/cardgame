import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.entwine;

// 双呪：MTG #243。エナジーを追加で K 払うと、モード選択のカードのすべてのモードを実行する
export default defineAbility({
  id: 'entwine',
  name: '双呪',
  order: 14,
  group: 'モード',
  summary: `モード選択のカードで、エナジーを追加でK払うと、すべてのモードを（A→B→Cの順に）実行する。ポイントは選ばれなかったモードの合計×${B.rate}`,
  value: countParam('追加エナジー', { min: 1, max: B.maxExtra, default: 1 }),
  points: (_a, ctx) => ctx.modeOtherPoints * B.rate,
  formula: (_a, ctx) => `他のモード${round2(ctx.modeOtherPoints)}×${B.rate}`,
  displayName: (a) => `双呪${n(a)}`,
  describe: (a) => `エナジー+${n(a)}で、すべてのモードを選ぶ`,
  battle: { entwineCost: (a) => n(a) },
});
