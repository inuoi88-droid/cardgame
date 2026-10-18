import { BALANCE } from '../../balance.ts';
import { defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.bounce;

export default defineEffect({
  id: 'bounce',
  name: 'バウンス',
  group: 'disrupt',
  order: 63,
  summary: 'コストN以下の相手モンスター1体を持ち主の手札に戻す',
  value: { label: 'コスト', min: BALANCE.card.costMin, max: BALANCE.card.costMax, default: 1 },
  targetRule: 'enemyMonsterOne',
  basePoints: (e) => B.flat + B.perCost * n(e),
  baseFormula: (e) => `${B.flat}+${n(e)}×${B.perCost}`,
  describe: (e, c) => `コスト${n(e)}以下の${c.target}を持ち主の手札に戻す`,
  shortValue: (e) => `コスト${n(e)}以下`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) {
        const m = rt.monster(t);
        if (!m) continue;
        const cost = rt.cardDef(m.card.cardId)?.cost ?? 0;
        if (cost <= n(e)) rt.bounce(t);
        else rt.log(`「${rt.cardName(m.card.cardId)}」はコスト${cost}なので戻せない`);
      }
    },
  },
});
