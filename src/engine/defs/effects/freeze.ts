import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.freeze;

export default defineEffect({
  id: 'freeze',
  name: '凍結',
  group: 'status',
  order: 32,
  summary: '凍結させる（次のターン、モンスターは攻撃できない。プレイヤーは最初に使うカードのコスト+1）',
  targetRule: 'enemyAny',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (_e, c) => `${c.target}を凍結させる`,
  battle: {
    resolve(rt) {
      for (const t of rt.targets) rt.addStatus(t, 'freeze', 1);
    },
  },
});
