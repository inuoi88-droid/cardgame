import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.recruit;
const name = BALANCE.battle.tokenName;

// 徴募：MTG #474（徴募を行う）。カードを1枚引き、手札を1枚選んで捨てる。捨てたのがスキルなら小鬼を出す
export default defineEffect({
  id: 'recruit',
  name: '徴募',
  group: 'resource',
  order: 58.5,
  summary: `カードを1枚引き、手札を1枚選んで捨てる。捨てたのがスキルなら攻撃力${B.stat}・体力${B.stat}の${name}（トークン）を出す`,
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `カードを1枚引き、手札を1枚捨てる。捨てたのがスキルなら攻撃力${B.stat}・体力${B.stat}の${name}を出す`,
  battle: {
    resolve(rt) {
      rt.draw(rt.controller, 1);
      rt.chooseDiscardThen(rt.controller, 1, 'recruit');
    },
  },
});
