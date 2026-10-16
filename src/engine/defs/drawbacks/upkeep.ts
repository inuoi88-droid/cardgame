import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.upkeep;

export default defineDrawback({
  id: 'upkeep',
  name: '維持費',
  order: 8,
  summary: `自分のターン開始時に自分に${B.damage}ダメージ（モンスター専用・倍率込みの固定値）`,
  monsterOnly: true,
  fixedPoints: B.fixed,
  basePoints: () => B.fixed,
  baseFormula: () => `${B.fixed}（固定）`,
  describe: () => `場にいる間、自分のターン開始時に自分に${B.damage}ダメージ`,
  battle: {
    onBoardTurnStart(rt, _d, m) {
      rt.log(`「${rt.cardName(m.card.cardId)}」の維持費`);
      rt.selfDamage(B.damage);
    },
  },
});
