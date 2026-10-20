import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';
import { ceilPoints } from '../../math.ts';

const B = BALANCE.keywords.lifelink;

// 絆魂：MTG #211。攻撃・反撃・格闘で減らしたぶん、自分のHPを回復する
export default defineKeyword({
  id: 'lifelink',
  name: '絆魂',
  order: 12,
  summary: 'このモンスターが攻撃・反撃・格闘で与えたダメージ（実際に減らした分）だけ、自分のHPを回復する',
  points: (_k, s) => Math.max(B.min, ceilPoints(B.perAttack * s.attack)),
  formula: (_k, s) => `max(${B.min}, 攻撃力${s.attack}×${B.perAttack})`,
  displayName: () => '絆魂',
  describe: () => 'このモンスターが攻撃・反撃・格闘で与えたダメージぶん、自分のHPを回復する',
  battle: { lifelink: true },
});
