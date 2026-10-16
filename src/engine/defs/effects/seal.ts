import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.seal;

export default defineEffect({
  id: 'seal',
  name: '封印',
  group: 'status',
  order: 36,
  summary: 'モンスターの効果とキーワードをすべて失わせる',
  targetRule: 'enemyMonster',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (_e, c) => `${c.target}を封印する（効果とキーワードをすべて失う）`,
  battle: {
    resolve(rt) {
      for (const t of rt.targets) rt.setSealed(t);
    },
  },
});
