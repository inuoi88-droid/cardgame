import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.duplicate;

export default defineEffect({
  id: 'duplicate',
  name: '複製',
  group: 'special',
  order: 71,
  summary: '手札のカード1枚のコピーを手札に加える（エピック以上）',
  targetRule: 'self',
  minRarity: 'epic',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '手札のカード1枚のコピーを手札に加える',
});
