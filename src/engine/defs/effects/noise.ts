import { BALANCE } from '../../balance.ts';
import { defineEffect, n, countParam } from '../../define.ts';

const B = BALANCE.effects.noise;

export default defineEffect({
  id: 'noise',
  name: 'ノイズ投入',
  group: 'disrupt',
  order: 62,
  summary: `相手の山札に「ノイズ」をN枚混ぜる（効果のないカード。コスト${BALANCE.battle.noiseRemoveCost}で除外できる。相手は1ターンに${BALANCE.battle.maxNoiseReceivedPerTurn}枚まで受け取る）`,
  // 相手が1ターンに受け取れるのは maxNoiseReceivedPerTurn 枚まで。それより多くしてもポイントの無駄になる（報告 #16）
  value: countParam('枚数', { default: 1, max: BALANCE.battle.maxNoiseReceivedPerTurn }),
  targetRule: 'enemyPlayer',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `相手の山札にノイズを${n(e)}枚混ぜる`,
  battle: {
    resolve(rt, e) {
      rt.addNoise(rt.opponent, n(e));
    },
  },
});
