import { BALANCE } from '../../balance.ts';
import { defineEffect, modsOf, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.multiHit;
const P = BALANCE.params;
const hits = (e: { hits?: number }) => e.hits ?? 0;

export default defineEffect({
  id: 'multiHit',
  name: '連撃',
  group: 'damage',
  order: 11,
  summary: 'N点ダメージをM回与える（守備力で毎回軽減される）',
  value: valueParam('ダメージ', { default: 1 }),
  hits: { label: '回数', min: P.hitsMin, max: P.hitsMax, default: P.hitsMin },
  targetRule: 'enemyAny',
  isDamage: true,
  allowsMods: true,
  basePoints: (e) => B.perValueHit * n(e) * hits(e),
  baseFormula: (e) => `${n(e)}×${hits(e)}×${B.perValueHit}`,
  describe: (e, c) => `${c.target}に${c.modPrefix}${n(e)}ダメージを${hits(e)}回与える${c.modSuffix}`,
  shortValue: (e) => `${n(e)}×${hits(e)}`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) {
        for (let i = 0; i < hits(e); i++) rt.hit(t, n(e), modsOf(e));
      }
    },
  },
});
