import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.ready;

// 再行動：MTG #91・#104・#431。もう一度攻撃できるようにする（召喚酔い・凍結・防衛は解除しない）
export default defineEffect({
  id: 'ready',
  name: '再行動',
  group: 'buff',
  order: 48,
  summary: '自分のモンスターをもう一度攻撃できるようにする（1体につき1ターン1回。使用時・召喚時だけ。召喚酔い・凍結は解除しない）',
  targetRule: 'allyMonsterOne',
  timings: ['play', 'summon'],
  // 自分自身・全体に付けると何度でも攻撃できてしまうので外す
  excludeTargets: ['thisMonster', 'allyMonsters', 'otherAllies'],
  // ターン開始時に再行動しても意味がないので、遅延（次のターンに）は付けられない
  noDelay: true,
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (_e, c) => `${c.target}をもう一度攻撃できるようにする（1体につき1ターン1回）`,
  battle: {
    resolve(rt) {
      for (const t of rt.targets) rt.ready(t);
    },
  },
});
