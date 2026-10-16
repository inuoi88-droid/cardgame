import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.drawJam;
const amount = BALANCE.battle.drawJamAmount;

export default defineEffect({
  id: 'drawJam',
  name: 'ドロー妨害',
  group: 'disrupt',
  order: 60,
  summary: `相手が次のターンに引く枚数−${amount}`,
  targetRule: 'enemyPlayer',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `相手が次のターンに引く枚数−${amount}`,
  battle: {
    resolve(rt) {
      rt.addNextTurn(rt.opponent, { draw: -amount });
    },
  },
});
