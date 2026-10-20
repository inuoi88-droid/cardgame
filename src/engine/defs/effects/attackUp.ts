import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.attackUp;

export default defineEffect({
  id: 'attackUp',
  name: '攻撃力アップ',
  group: 'buff',
  order: 42,
  summary: '自分のモンスター1体の攻撃力+N（永続）',
  value: valueParam('上昇量', { default: 1 }),
  targetRule: 'allyMonsterOne',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}の攻撃力を+${n(e)}する`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.changeAttack(t, n(e));
    },
  },
});
