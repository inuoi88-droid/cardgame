import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.doubleAttack;

export default defineKeyword({
  id: 'doubleAttack',
  name: '二回攻撃',
  order: 5,
  summary: `毎ターン2回攻撃できる（ポイントは攻撃力に比例。攻撃力は最低${BALANCE.stats.keywordMinAttack}として数える）`,
  points: (_k, s) => B.perAttack * s.attack,
  formula: (_k, s) => `攻撃力${s.attack}×${B.perAttack}`,
  displayName: () => '二回攻撃',
  describe: () => '毎ターン2回攻撃できる',
  battle: { attacksPerTurn: B.attacks },
});
