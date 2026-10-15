import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.haste;

export default defineKeyword({
  id: 'haste',
  name: '速攻',
  order: 1,
  summary: '召喚したターンから攻撃できる',
  points: (_k, s) => B.perAttack * s.attack,
  formula: (_k, s) => `攻撃力${s.attack}×${B.perAttack}`,
  displayName: () => '速攻',
  describe: () => '召喚したターンから攻撃できる',
});
