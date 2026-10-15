import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.discount;
const amount = BALANCE.battle.discountAmount;

export default defineEffect({
  id: 'discount',
  name: '軽減',
  group: 'resource',
  order: 53,
  summary: `次に使うカードのコスト−${amount}`,
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `次に使うカードのコスト−${amount}`,
});
