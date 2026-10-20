import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.infight;

// 同士討ち：MTG #548（家族の集い）。相手モンスターがそれぞれ、ランダムな他の相手モンスター1体に攻撃力ぶんのダメージを与える（同時）
export default defineEffect({
  id: 'infight',
  name: '同士討ち',
  group: 'special',
  order: 72.5,
  summary: '相手モンスターそれぞれが、ランダムな他の相手モンスター1体に攻撃力（武士道を含む）ぶんのダメージを与える（同時。相手のモンスターが2体以上のとき。反撃は起きない。レア以上）',
  targetRule: 'self',
  minRarity: 'rare',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '相手モンスターそれぞれが、ランダムな他の相手モンスター1体に攻撃力ぶんのダメージを与える',
  battle: {
    resolve(rt) {
      rt.infight(rt.opponent);
    },
  },
});
