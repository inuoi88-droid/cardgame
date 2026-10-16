import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.dispel;

export default defineEffect({
  id: 'dispel',
  name: '解除',
  group: 'disrupt',
  order: 65,
  summary: '相手の永続効果を1つ消す',
  targetRule: 'enemyPlayer',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '相手の永続効果を1つ消す',
  battle: {
    choose(rt) {
      return { prompt: '消す相手の効果を選んでください', options: rt.dispelOptions(rt.opponent), min: 1, max: 1 };
    },
    resolve(rt, _e, picks) {
      if (picks?.[0]) rt.dispel(rt.opponent, picks[0]);
    },
  },
});
