import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.startEngine;
const S = BALANCE.speed;

// エンジン始動：MTG #387（エンジン始動！）。速度ゲージを始める（速度が無ければ1）。以後、自分のターンに相手のHPを減らすと1ターン1回+1
export default defineEffect({
  id: 'startEngine',
  name: 'エンジン始動',
  group: 'buff',
  order: 47.5,
  summary: `速度ゲージを始める（速度が無ければ${S.start}になる）。以後、自分のターンに相手のHPを減らすと1ターン1回速度+1（最大${S.max}。下がらない）`,
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `エンジン始動（速度が無ければ${S.start}になる）`,
  battle: {
    resolve(rt) {
      rt.startEngine(rt.controller);
    },
  },
});
