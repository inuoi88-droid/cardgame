import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.heal;

export default defineEffect({
  id: 'heal',
  name: '回復',
  group: 'defense',
  order: 21,
  summary: '自分のHPをN回復する',
  value: valueParam('回復量', { default: 2 }),
  targetRule: 'self',
  // 対象「お互い」を選べる（MTG 要素 ○ バッチA）
  symmetric: true,
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  // 「お互い」のときは前に「お互い、」が付くので「自分の」を付けない（決定事項 #117）
  describe: (e) => `${e.target === 'bothPlayers' ? '' : '自分の'}HPを${n(e)}回復する`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.heal(t, n(e));
    },
  },
});
