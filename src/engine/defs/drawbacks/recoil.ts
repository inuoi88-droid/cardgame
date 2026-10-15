import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.recoil;

export default defineDrawback({
  id: 'recoil',
  name: '反動',
  order: 5,
  summary: `次のターンのエナジー−${B.energyLoss}`,
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `次のターンのエナジー−${B.energyLoss}`,
});
