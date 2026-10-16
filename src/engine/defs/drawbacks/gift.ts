import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.gift;

export default defineDrawback({
  id: 'gift',
  name: '施し',
  order: 7,
  summary: `相手が次のターンに${B.extraDraw}枚多く引く`,
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `相手が次のターンに${B.extraDraw}枚多く引く`,
  battle: {
    resolve(rt) {
      rt.addNextTurn(rt.opponent, { draw: B.extraDraw });
    },
  },
});
