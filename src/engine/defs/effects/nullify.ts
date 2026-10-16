import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.nullify;

export default defineEffect({
  id: 'nullify',
  name: '無効化',
  group: 'defense',
  order: 22,
  summary: '次に受けるダメージ1回を0にする',
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '次に受けるダメージ1回を0にする',
  battle: {
    resolve(rt) {
      for (const t of rt.targets) rt.addStatus(t, 'nullify', 1);
    },
  },
});
