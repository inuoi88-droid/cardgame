import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.defenseUp;

export default defineEffect({
  id: 'defenseUp',
  name: '守備力アップ',
  group: 'buff',
  order: 43,
  summary: `自分のモンスター1体の守備力+N（永続。守備力は最大${BALANCE.stats.defenseMax}）`,
  value: valueParam('上昇量', { default: 1, max: B.maxValue }),
  targetRule: 'allyMonsterOne',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}の守備力を+${n(e)}する`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.changeDefense(t, n(e));
    },
  },
});
