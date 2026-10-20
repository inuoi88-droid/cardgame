import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.iceLock;

// 氷結：MTG #155（氷カウンター）。相手の次のターン、引いた後の手札からランダムに N 枚が凍り、そのターンは使えない
export default defineEffect({
  id: 'iceLock',
  name: '氷結',
  group: 'disrupt',
  order: 74.3,
  summary: `相手の次のターン、引いた後の手札からランダムにN枚が凍り、そのターンは使えない（サイクリング・魂力も不可。凍結は「最初のカードのコスト+1」、氷結は「カードが使えない」。合計${BALANCE.battle.iceCap}枚まで。浄化で消える）`,
  value: countParam('枚数', { default: 1, max: B.maxCount }),
  targetRule: 'enemyPlayer',
  basePoints: (e) => B.perCount * n(e),
  baseFormula: (e) => `${n(e)}×${B.perCount}`,
  describe: (e) => `相手の次のターン、手札${n(e)}枚を凍らせる（そのターンは使えない）`,
  battle: {
    resolve(rt, e) {
      rt.addIce(rt.opponent, n(e));
    },
  },
});
