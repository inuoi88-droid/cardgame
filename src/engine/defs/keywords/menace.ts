import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';
import { ceilPoints } from '../../math.ts';

const B = BALANCE.keywords.menace;

// 威圧：MTG #314（威迫）。このモンスターが攻撃したとき、相手モンスターの反撃を受けない（倒せなくても）
export default defineKeyword({
  id: 'menace',
  name: '威圧',
  order: 19,
  summary: 'このモンスターが攻撃したとき、相手モンスターの反撃を受けない（倒せなくても。相手から攻撃されたときの反撃はする）',
  points: (_k, s) => Math.max(B.min, ceilPoints(B.perAttack * s.attack)),
  formula: (_k, s) => `max(${B.min}, 攻撃力${s.attack}×${B.perAttack})`,
  displayName: () => '威圧',
  describe: () => '攻撃したとき、反撃を受けない',
  battle: { noRetaliation: true },
});
