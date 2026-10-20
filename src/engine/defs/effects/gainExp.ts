import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.gainExp;

// 経験を得る：MTG #152（経験カウンター）。自分の経験+N（試合中ずっと残る）。修飾「経験1につき」の数値が大きくなる
export default defineEffect({
  id: 'gainExp',
  name: '経験を得る',
  group: 'resource',
  order: 74.2,
  summary: `自分の経験+N（試合中ずっと残る。最大${BALANCE.battle.expCap}。浄化・解除で消えない）。修飾「経験1につき」の数値が大きくなる`,
  value: countParam('経験', { default: 1, max: B.maxCount }),
  targetRule: 'self',
  basePoints: (e) => B.perCount * n(e),
  baseFormula: (e) => `${n(e)}×${B.perCount}`,
  describe: (e) => `経験+${n(e)}を得る`,
  battle: {
    resolve(rt, e) {
      rt.addExp(rt.controller, n(e));
    },
  },
});
