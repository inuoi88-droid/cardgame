import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.bleed;

export default defineEffect({
  id: 'bleed',
  name: '出血',
  group: 'status',
  order: 35,
  summary: '出血Nを与える（攻撃を受けるたびにN追加ダメージ。ターン終了時に半分）',
  value: valueParam('出血', { default: 1 }),
  targetRule: 'enemyAny',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}に出血${n(e)}を与える`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.addStatus(t, 'bleed', n(e));
    },
  },
});
