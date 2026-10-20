import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.crown;

// 王冠を得る：MTG #183・#479（統治者・統治者になる）。王冠を持っている間、自分のターン開始時に1枚多く引く。
// 相手のモンスターの攻撃で自分のHPが減ると、王冠はそのモンスターの持ち主に移る
export default defineEffect({
  id: 'crown',
  name: '王冠を得る',
  group: 'resource',
  order: 58.5,
  summary: `王冠を得る（持っている間、自分のターン開始時に${BALANCE.crown.extraDraw}枚多く引く。相手のモンスターの攻撃でHPが減ると奪われる）`,
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '王冠を得る',
  battle: {
    resolve(rt) {
      rt.takeCrown(rt.controller);
    },
  },
});
