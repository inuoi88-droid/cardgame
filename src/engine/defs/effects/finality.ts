import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.finality;

// 消滅の印：MTG #148（最終カウンター）。モンスターに消滅の印を付ける。破壊されたら捨て札ではなく除外される（蘇生・回収の対策）
export default defineEffect({
  id: 'finality',
  name: '消滅の印',
  group: 'disrupt',
  order: 74,
  summary: 'モンスターに消滅の印を付ける。そのモンスターが破壊されたら、捨て札ではなく除外される（蘇生・回収の対策。場を離れると印も消える）',
  targetRule: 'enemyMonster',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (_e, c) => `${c.target}に消滅の印を付ける（破壊されたら除外される）`,
  battle: {
    resolve(rt) {
      for (const t of rt.targets) rt.markMonster(t, 'finality');
    },
  },
});
