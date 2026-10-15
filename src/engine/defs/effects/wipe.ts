import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.wipe;

export default defineEffect({
  id: 'wipe',
  name: '全体破壊',
  group: 'special',
  order: 72,
  summary: '自分の分も含め、場のモンスターをすべて破壊する（レジェンドのみ）',
  targetRule: 'board',
  minRarity: 'legend',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '自分の分も含め、場のモンスターをすべて破壊する',
});
