import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.swapHp;

// HP交換：MTG #416（交換する）。自分と相手のHPを入れ替える（レジェンドのみ・1試合1回・自分のHPが相手より少ないときだけ）
export default defineEffect({
  id: 'swapHp',
  name: 'HP交換',
  group: 'special',
  order: 92,
  summary: `自分と相手のHPを入れ替える（レジェンドのみ・1試合1回・使用時だけ。自分のHPが相手より少ないときだけ使える。自分が得るHPは最大HPの${Math.round(B.gainCapRate * 100)}%まで。ダメージ・回復ではない。写し・無料で使ったときは不発）`,
  targetRule: 'self',
  minRarity: 'legend',
  timings: ['play'],
  bases: ['spell'],
  noDelay: true,
  noCopy: true,
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '自分と相手のHPを入れ替える',
  battle: {
    canPlay(g, p) {
      const me = g.players[p];
      const opp = g.players[p === 0 ? 1 : 0];
      if (me.swapUsed) return 'HP交換はこの試合でもう使いました（1試合1回）';
      if (me.hp >= opp.hp) return 'HP交換は自分のHPが相手より少ないときだけ使えます';
      return null;
    },
    resolve(rt) {
      rt.swapHp();
    },
  },
});
