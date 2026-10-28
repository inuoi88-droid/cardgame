import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.haste;

export default defineKeyword({
  id: 'haste',
  name: '疾走',
  order: 1,
  summary: `召喚したターンから攻撃できる（そのターンは二回攻撃でも1回だけ。ポイントは${B.flat}＋攻撃力×${B.perAttack}。攻撃力は最低${BALANCE.stats.keywordMinAttack}として数える）`,
  points: (_k, s) => B.flat + B.perAttack * s.attack,
  formula: (_k, s) => `${B.flat}+攻撃力${s.attack}×${B.perAttack}`,
  displayName: () => '疾走',
  describe: () => '召喚したターンから攻撃できる',
  battle: { haste: true },
});
