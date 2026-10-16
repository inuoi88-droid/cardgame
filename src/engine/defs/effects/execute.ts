import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.execute;

export default defineEffect({
  id: 'execute',
  name: '処刑',
  group: 'damage',
  order: 12,
  summary: '体力N以下の相手モンスターを破壊する',
  value: valueParam('体力', { default: 2 }),
  targetRule: 'enemyMonster',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `体力${n(e)}以下の${c.target}を破壊する`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) {
        const m = rt.monster(t);
        if (!m) continue;
        if (m.hp <= n(e)) rt.destroy(t);
        else rt.log(`「${rt.cardName(m.card.cardId)}」は体力${m.hp}なので処刑できない`);
      }
    },
  },
});
