import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.stealth;

export default defineKeyword({
  id: 'stealth',
  name: '隠密',
  order: 6,
  summary: '召喚してから、相手の次のターン終了まで攻撃対象にならない',
  points: (_k, s) => B.flat + B.perAttack * s.attack,
  formula: (_k, s) => `${B.flat}+攻撃力${s.attack}×${B.perAttack}`,
  displayName: () => '隠密',
  describe: () => '召喚してから相手の次のターン終了まで攻撃対象にならない',
  battle: { stealthOnSummon: true },
});
