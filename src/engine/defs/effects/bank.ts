import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.bank;

// 蓄え：MTG #139（マナ・バーン（廃止））。ターン終了時に、使わずに残ったエナジーを最大Nまで次のターンへ持ち越す
export default defineEffect({
  id: 'bank',
  name: '蓄え',
  group: 'resource',
  order: 52.5,
  summary: `自分のターン終了時に、使わずに残ったエナジーを最大Nまで次のターンへ持ち越す（ターン終了時だけ。1ターンに増やせるエナジー${BALANCE.battle.maxEnergyGainPerTurn}に数える）`,
  value: countParam('エナジー', { default: 1, max: B.maxValue }),
  targetRule: 'self',
  timings: ['turnEnd'],
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `残ったエナジーを最大${n(e)}まで次のターンへ持ち越す`,
  battle: {
    resolve(rt, e) {
      const ps = rt.player(rt.controller);
      const k = Math.min(ps.energy, n(e));
      if (k <= 0) {
        rt.log('残ったエナジーがないので持ち越せない');
        return;
      }
      rt.log(`エナジーを${k}持ち越す`);
      rt.addNextTurn(rt.controller, { energy: k });
    },
  },
});
