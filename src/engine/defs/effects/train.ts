import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.train;

// 鍛錬：MTG #140・#450・#442・#432・#302・#315。自分のモンスターの攻撃力と体力を+N（永続）
export default defineEffect({
  id: 'train',
  name: '鍛錬',
  group: 'buff',
  order: 46,
  summary: '自分のモンスターの攻撃力と体力を+N（永続。最大体力も増える）',
  value: valueParam('上昇量', { default: 1, max: B.maxValue }),
  targetRule: 'allyMonsterOne',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}の攻撃力と体力を+${n(e)}する`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.changeStats(t, n(e) + rt.growBonus(t), n(e));
    },
  },
});
