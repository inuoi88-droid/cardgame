import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.exert;

// 消耗：MTG #447（督励する）。このモンスターが攻撃したら、次の自分のターンは攻撃できない（反撃はする）
export default defineDrawback({
  id: 'exert',
  name: '消耗',
  order: 17,
  summary: '攻撃したら、次の自分のターンは攻撃できない（混乱などの自動攻撃もしない。反撃はする。モンスター専用・倍率込みの固定値。攻撃力が高いほど大きい）',
  monsterOnly: true,
  fixed: true,
  basePoints: (_d, c) => Math.max(B.min, B.perAttack * (c.stats?.attack ?? 0)),
  baseFormula: (_d, c) => `max(${B.min}, 攻撃力${c.stats?.attack ?? 0}×${B.perAttack})（固定）`,
  describe: () => '攻撃したら、次の自分のターンは攻撃できない',
  battle: { exert: true },
});
