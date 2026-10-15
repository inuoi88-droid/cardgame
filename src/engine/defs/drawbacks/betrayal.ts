import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.betrayal;

export default defineDrawback({
  id: 'betrayal',
  name: '裏切り',
  order: 10,
  summary: `召喚から${B.turns}ターン後、自分のプレイヤーを攻撃するようになる（モンスター専用・倍率込みの固定値）`,
  monsterOnly: true,
  fixedPoints: B.fixed,
  basePoints: () => B.fixed,
  baseFormula: () => `${B.fixed}（固定）`,
  describe: () => `召喚から${B.turns}ターン後、自分のプレイヤーを攻撃するようになる`,
});
