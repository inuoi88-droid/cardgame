import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.offspring;

// 新生：MTG #383。このモンスターの攻撃力1・体力1のコピー（トークン）を出す。コピーは効果とキーワードを持つ
export default defineEffect({
  id: 'offspring',
  name: '新生',
  group: 'buff',
  order: 45.5,
  summary: `このモンスターの攻撃力${B.stat}・体力${B.stat}のコピー（トークン）を出す。コピーは効果・キーワード・デメリットを持ち、召喚時の効果も出る（モンスターの召喚時だけ・レア以上。トークンからは出ない）`,
  targetRule: 'self',
  timings: ['summon'],
  bases: ['monster'],
  minRarity: 'rare',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `このモンスターの攻撃力${B.stat}・体力${B.stat}のコピーを出す`,
  battle: {
    resolve(rt) {
      // 連鎖の防止：トークン（コピー）からは出さない
      if (rt.src.token) {
        rt.log('トークンは複写できない');
        return;
      }
      rt.createToken(rt.controller, rt.src.cardId, { attack: B.stat, hp: B.stat, defense: 0, copy: true });
    },
  },
});
