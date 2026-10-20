import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.prepare;

// 準備：MTG #170・#420（手掛かり・調査を行う）。次のターンに引く枚数+N
export default defineEffect({
  id: 'prepare',
  name: '準備',
  group: 'resource',
  order: 50.5,
  summary: `次の自分のターンに引く枚数+N（1ターンに引けるのは${BALANCE.battle.maxDrawPerTurn}枚まで）`,
  value: countParam('枚数', { default: 1, max: B.maxValue }),
  targetRule: 'self',
  symmetric: true,
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `次のターンに引く枚数+${n(e)}`,
  battle: {
    resolve(rt, e) {
      rt.addNextTurn(rt.controller, { draw: n(e) });
    },
  },
});
