import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.discount;
const amount = BALANCE.battle.discountAmount;

export default defineEffect({
  id: 'discount',
  name: '軽減',
  group: 'resource',
  order: 53,
  summary: `次に使うカードのコスト−${amount}（エナジーの増加と合わせて1ターン+${BALANCE.battle.maxEnergyGainPerTurn}まで）`,
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `次に使うカードのコスト−${amount}`,
  battle: {
    resolve(rt) {
      rt.addDiscount(rt.controller, 1);
    },
  },
});
