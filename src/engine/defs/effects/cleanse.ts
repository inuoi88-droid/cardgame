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
  // 対象「お互い」を選べる（MTG 要素 ○ バッチA）
  symmetric: true,
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (e) => (e.target === 'bothPlayers' ? '状態異常をすべて解除する' : '自分の状態異常をすべて解除する'),
  battle: {
    resolve(rt) {
      rt.cleanse(rt.controller);
    },
  },
});
