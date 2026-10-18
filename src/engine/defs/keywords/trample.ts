import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';
import { ceilPoints } from '../../math.ts';

const B = BALANCE.keywords.trample;

export default defineKeyword({
  id: 'trample',
  name: '貫通',
  order: 4,
  summary: 'モンスターを倒して余ったダメージが、相手プレイヤーに通る',
  points: (_k, s) => Math.max(B.min, ceilPoints(B.perAttack * s.attack)),
  formula: (_k, s) => `max(${B.min}, 攻撃力${s.attack}×${B.perAttack})`,
  displayName: () => '貫通',
  describe: () => 'モンスターを倒して余ったダメージが相手プレイヤーに通る',
  battle: { trample: true },
});
