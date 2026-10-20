import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.counter;

export default defineEffect({
  id: 'counter',
  name: '反撃',
  group: 'damage',
  order: 13,
  summary: '次の自分のターン開始時までに攻撃を受けたら、攻撃してきた相手にN点ダメージを返す',
  value: valueParam('ダメージ', { default: 2 }),
  targetRule: 'self',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `反撃${n(e)}を得る`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.addStatus(t, 'counter', n(e));
    },
  },
});
