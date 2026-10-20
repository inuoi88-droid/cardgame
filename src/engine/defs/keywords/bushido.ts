import { BALANCE } from '../../balance.ts';
import { defineKeyword, n, valueParam } from '../../define.ts';

const B = BALANCE.keywords.bushido;

// 武士道：MTG #246。モンスターと戦うとき（攻撃・反撃・格闘）だけ攻撃力+N（プレイヤーへの攻撃には乗らない）
export default defineKeyword({
  id: 'bushido',
  name: '武士道',
  order: 13,
  summary: 'モンスターと戦うとき（攻撃・反撃・格闘）だけ、攻撃力+N（プレイヤーへの攻撃には乗らない）',
  value: valueParam('上昇量', { default: 1, max: B.maxValue }),
  points: (k) => B.perValue * n(k),
  formula: (k) => `${n(k)}×${B.perValue}`,
  displayName: (k) => `武士道${n(k)}`,
  describe: (k) => `モンスターと戦うとき（攻撃・反撃・格闘）、攻撃力+${n(k)}`,
  battle: { combatBonus: (k) => n(k) },
});
