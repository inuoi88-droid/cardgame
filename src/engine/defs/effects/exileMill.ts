import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.exileMill;

// 山札消滅：MTG #617（ライブラリーアウト）のアレンジ。相手の山札の上N枚を除外する（切り直しても戻らない）
export default defineEffect({
  id: 'exileMill',
  name: '山札消滅',
  group: 'disrupt',
  order: 75.1,
  summary: '相手の山札の上N枚を除外する（足りなければある分、切り直さない。切削と違って捨て札に行かず、デッキがやせる。山札切れですぐ負けはしないが、山札も捨て札も無くなると引くたびに疲労のダメージ）',
  value: countParam('枚数', { default: 1, max: B.maxCount }),
  targetRule: 'enemyPlayer',
  basePoints: (e) => B.perCount * n(e),
  baseFormula: (e) => `${n(e)}×${B.perCount}`,
  describe: (e) => `相手の山札の上${n(e)}枚を除外する`,
  battle: {
    resolve(rt, e) {
      const top = rt.player(rt.opponent).deck.slice(0, n(e)).map((c) => c.uid);
      if (top.length === 0) {
        rt.log('相手の山札がないので何も起きない');
        return;
      }
      rt.deckToExile(rt.opponent, top, '山札消滅');
    },
  },
});
