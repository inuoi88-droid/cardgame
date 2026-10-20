import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.boon;
const uses = (e: { hits?: number }) => e.hits ?? 1;

// 恩恵：MTG #557。次に使うアタック M 回ぶん、そのアタックの最初の1発のダメージ+N（回数制の強化）
export default defineEffect({
  id: 'boon',
  name: '恩恵',
  group: 'buff',
  order: 41.5,
  summary: '次に使うアタックM回ぶん、そのアタックの最初の1発のダメージ+N（筋力・気合と同じく最初の1発だけ。浄化・解除では消えない）',
  value: valueParam('量', { default: 1, max: B.maxValue }),
  hits: countParam('回数', { min: 1, max: B.maxUses, default: 1 }),
  targetRule: 'self',
  symmetric: true,
  scalable: true,
  basePoints: (e) => B.perValueUse * n(e) * uses(e),
  baseFormula: (e) => `${n(e)}×${B.perValueUse}×${uses(e)}`,
  describe: (e) => `次のアタック${uses(e)}回、ダメージ+${n(e)}（それぞれ最初の1発）`,
  shortValue: (e) => `${n(e)}×${uses(e)}`,
  battle: {
    resolve(rt, e) {
      rt.addBoon(rt.controller, n(e), uses(e));
    },
  },
});
