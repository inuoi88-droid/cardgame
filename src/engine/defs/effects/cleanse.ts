import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.cleanse;

export default defineEffect({
  id: 'cleanse',
  name: '浄化',
  group: 'defense',
  order: 23,
  summary: '自分の状態異常をすべて解除する',
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '自分の状態異常をすべて解除する',
});
