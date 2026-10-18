import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.parasite;

export default defineDrawback({
  id: 'parasite',
  name: '寄生',
  order: 9,
  summary: `手札にある間、ターン終了時に自分に${B.damage}ダメージ（倍率込みの固定値）`,
  fixed: true,
  basePoints: () => B.fixed,
  baseFormula: () => `${B.fixed}（固定）`,
  describe: () => `手札にある間、ターン終了時に自分に${B.damage}ダメージ`,
  battle: {
    onHandTurnEnd(rt) {
      rt.selfDamage(B.damage);
    },
  },
});
