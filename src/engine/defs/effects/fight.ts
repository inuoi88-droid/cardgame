import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.fight;

// 格闘：MTG #418・#240。自分のモンスター1体と相手モンスター1体を戦わせる（互いに攻撃力ぶんのダメージ。反撃・攻撃するたびは起きない）
export default defineEffect({
  id: 'fight',
  name: '格闘',
  group: 'damage',
  order: 14,
  summary: '自分のモンスター1体と相手モンスター1体を戦わせる（互いに攻撃力ぶんのダメージを与える。接死・絆魂・武士道が働く）',
  targetRule: 'fight',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (_e, c) => `${c.target}を戦わせる（互いに攻撃力ぶんのダメージを与える）`,
  battle: {
    resolve(rt) {
      const [ally, enemy] = rt.targets;
      if (ally && enemy) rt.fight(ally, enemy);
    },
  },
});
