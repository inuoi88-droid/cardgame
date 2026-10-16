import { BALANCE } from '../../balance.ts';
import { defineDrawback, me } from '../../define.ts';

const B = BALANCE.drawbacks.selfBurn;

export default defineDrawback({
  id: 'selfBurn',
  name: '自分にやけど',
  order: 3,
  summary: '自分がやけど状態になる',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `自分がやけど（${BALANCE.battle.burnTurns}ターン）になる`,
  battle: {
    resolve(rt) {
      rt.addStatus(me(rt), 'burn', BALANCE.battle.burnTurns);
    },
  },
});
