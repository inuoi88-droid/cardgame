import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.pump;

// 一時強化：MTG #311。このターンだけ攻撃力+N（ターン終了時に消える）
export default defineEffect({
  id: 'pump',
  name: '一時強化',
  group: 'buff',
  order: 49,
  summary: '自分のモンスターの攻撃力をこのターンだけ+N（攻撃・反撃・格闘に乗る。ターン終了時に消える）',
  value: valueParam('上昇量', { default: 1, max: B.maxValue }),
  targetRule: 'allyMonsterOne',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}の攻撃力をこのターンだけ+${n(e)}する`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.addTempAttack(t, n(e));
    },
  },
});
