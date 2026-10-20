import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.wither;

// 衰弱：MTG #141。相手モンスターの攻撃力と体力を−N（体力が0になると破壊。ダメージではない）
export default defineEffect({
  id: 'wither',
  name: '衰弱',
  group: 'disrupt',
  order: 66,
  summary: '相手モンスターの攻撃力と体力を−N（永続。体力が0になると破壊。ダメージではないので守備力・聖盾・不屈は効かない）',
  value: valueParam('減少量', { default: 1, max: B.maxValue }),
  targetRule: 'enemyMonster',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}の攻撃力と体力を−${n(e)}する（体力が0になると破壊）`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.changeStats(t, -n(e), -n(e));
    },
  },
});
