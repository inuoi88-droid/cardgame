import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.haste;

export default defineKeyword({
  id: 'haste',
  name: '疾走',
  order: 1,
  summary: `召喚したターンから攻撃できる（ポイントは攻撃力に比例。攻撃力は最低${BALANCE.stats.keywordMinAttack}として数える）`,
  points: (_k, s) => B.perAttack * s.attack,
  formula: (_k, s) => `攻撃力${s.attack}×${B.perAttack}`,
  displayName: () => '疾走',
  describe: () => '召喚したターンから攻撃できる',
  battle: { haste: true },
});
