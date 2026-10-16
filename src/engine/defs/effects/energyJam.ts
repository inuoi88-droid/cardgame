import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.energyJam;
const amount = BALANCE.battle.energyJamAmount;

export default defineEffect({
  id: 'energyJam',
  name: 'エナジー妨害',
  group: 'disrupt',
  order: 61,
  summary: `相手の次のターンのエナジー−${amount}`,
  targetRule: 'enemyPlayer',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `相手の次のターンのエナジー−${amount}`,
  battle: {
    resolve(rt) {
      rt.addNextTurn(rt.opponent, { energy: -amount });
    },
  },
});
