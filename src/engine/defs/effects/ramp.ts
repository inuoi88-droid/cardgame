import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.ramp;

// 最大エナジー増加：MTG #618（マナ加速）。以後ずっと、自分のターン開始時のエナジー+1（1人1回まで。レジェンドのみ）
export default defineEffect({
  id: 'ramp',
  name: '最大エナジー増加',
  group: 'special',
  order: 73.6,
  summary: `以後ずっと、自分のターン開始時のエナジー+1（1人${BALANCE.battle.rampCap}回まで。レジェンドのみ）`,
  targetRule: 'self',
  minRarity: 'legend',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `以後ずっと、ターン開始時のエナジー+1（${BALANCE.battle.rampCap}回まで）`,
  battle: {
    resolve(rt) {
      rt.ramp(rt.controller);
    },
  },
});
