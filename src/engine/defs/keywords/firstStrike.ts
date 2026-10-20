import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';
import { ceilPoints } from '../../math.ts';

const B = BALANCE.keywords.firstStrike;

// 先制攻撃：MTG #202。攻撃で相手モンスターを倒したとき、反撃を受けない
export default defineKeyword({
  id: 'firstStrike',
  name: '先制攻撃',
  order: 10,
  summary: '攻撃で相手モンスターを倒したとき、反撃を受けない（倒せなければ反撃を受ける）',
  points: (_k, s) => Math.max(B.min, ceilPoints(B.perAttack * s.attack)),
  formula: (_k, s) => `max(${B.min}, 攻撃力${s.attack}×${B.perAttack})`,
  displayName: () => '先制攻撃',
  describe: () => '攻撃で相手モンスターを倒したとき、反撃を受けない',
  battle: { firstStrike: true },
});
