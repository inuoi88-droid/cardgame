import { BALANCE } from '../../balance.ts';
import { defineKeyword, n, valueParam } from '../../define.ts';

const B = BALANCE.keywords.onslaught;

// 猛襲：MTG #270（激情）。相手プレイヤーを攻撃するときだけ、攻撃力+N（武士道の逆）
export default defineKeyword({
  id: 'onslaught',
  name: '猛襲',
  order: 18,
  summary: '相手プレイヤーを攻撃するときだけ、攻撃力+N（モンスターへの攻撃・反撃・格闘・貫通の余りには乗らない）',
  value: valueParam('上昇量', { default: 1, max: B.maxValue }),
  points: (k) => B.perValue * n(k),
  formula: (k) => `${n(k)}×${B.perValue}`,
  displayName: (k) => `猛襲${n(k)}`,
  describe: (k) => `相手プレイヤーを攻撃するとき、攻撃力+${n(k)}`,
  battle: { playerBonus: (k) => n(k) },
});
