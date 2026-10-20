import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.defender;

// 防衛：MTG #198。このモンスターは攻撃できない（混乱・裏切りの自動攻撃もしない。反撃はする。封印されても働く）
export default defineDrawback({
  id: 'defender',
  name: '防衛',
  order: 11,
  summary: 'このモンスターは攻撃できない（反撃はする。モンスター専用・倍率込みの固定値。攻撃力が高いほど大きい。裏切りとは同時に付けられない）',
  monsterOnly: true,
  fixed: true,
  conflicts: ['betrayal'],
  basePoints: (_d, c) => Math.max(B.min, B.perAttack * (c.stats?.attack ?? 0)),
  baseFormula: (_d, c) => `max(${B.min}, 攻撃力${c.stats?.attack ?? 0}×${B.perAttack})（固定）`,
  describe: () => 'このモンスターは攻撃できない',
  battle: { cannotAttack: true },
});
