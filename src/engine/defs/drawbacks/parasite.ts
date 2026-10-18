import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.parasite;

export default defineDrawback({
  id: 'parasite',
  name: '寄生',
  order: 9,
  summary: `このカードを引いたとき、自分に${B.damage}ダメージ（倍率込みの固定値。対戦開始時の手札・マリガンでも）`,
  fixed: true,
  basePoints: () => B.fixed,
  baseFormula: () => `${B.fixed}（固定）`,
  describe: () => `このカードを引いたとき、自分に${B.damage}ダメージ`,
  battle: {
    onDrawn(rt) {
      rt.selfDamage(B.damage);
    },
  },
});
