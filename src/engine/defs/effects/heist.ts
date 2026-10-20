import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';
import { NOISE_CARD_ID } from '../../battle/types.ts';
import type { EffectRuntime } from '../../battle/types.ts';

const B = BALANCE.effects.heist;

/** 相手の山札のうち選べるカード（ノイズと、定義の見えないカードは除く）の uid */
function pool(rt: EffectRuntime): string[] {
  return rt
    .player(rt.opponent)
    .deck.filter((c) => c.cardId !== NOISE_CARD_ID && rt.cardDef(c.cardId) !== undefined)
    .map((c) => c.uid);
}

// 強奪：MTG #560。相手の山札からランダムに3枚を見て1枚を選び、そのコピーを自分の手札に加える（使い切り）
export default defineEffect({
  id: 'heist',
  name: '強奪',
  group: 'special',
  order: 93,
  summary: `相手の山札からランダムに${B.look}枚を見て1枚を選び、そのコピー（使い切り：使うかターン終了で除外。コストは自分が払う）を自分の手札に加える（レア以上。相手の山札の順は変わらない。見たカードは自分だけに見える）`,
  targetRule: 'enemyPlayer',
  minRarity: 'rare',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => `相手の山札から${B.look}枚を見て、1枚のコピーを手札に加える`,
  battle: {
    choose(rt) {
      const list = pool(rt);
      const picked: string[] = [];
      while (picked.length < B.look && list.length > 0) picked.push(list.splice(rt.randInt(list.length), 1)[0]!);
      // 山札の順に並べる（相手の山札の並びは変えない）
      const deck = rt.player(rt.opponent).deck;
      const options = deck.filter((c) => picked.includes(c.uid)).map((c) => ({ id: c.uid, label: rt.cardName(c.cardId), cardId: c.cardId }));
      if (options.length > 0) rt.log(`${rt.player(rt.controller).name}は相手の山札から${options.length}枚を見た`);
      return { prompt: `強奪：相手の山札から見た${options.length}枚です。コピーを手札に加えるカードを1枚選んでください`, options, min: 1, max: 1 };
    },
    resolve(rt, _e, picks) {
      const uid = picks?.[0];
      if (!uid) {
        rt.log('強奪できるカードがない');
        return;
      }
      rt.heistCopy(rt.opponent, uid);
    },
  },
});
