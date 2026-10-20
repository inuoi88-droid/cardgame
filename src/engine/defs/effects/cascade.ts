import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';
import { NOISE_CARD_ID } from '../../battle/types.ts';

const B = BALANCE.effects.cascade;

// 続唱：MTG #287・#461（続唱・発見を行う）。山札の上からコストN以下のカードが出るまでめくり、それを無料で使う
export default defineEffect({
  id: 'cascade',
  name: '続唱',
  group: 'special',
  order: 71.5,
  summary: `山札の上から、コストN以下のカードが出るまで（最大${B.maxReveal}枚）めくり、それを無料で使う。めくった他のカードは元の順で山札の下へ（レア以上。無料で使う連鎖は${BALANCE.battle.maxFreePlayDepth}段まで）`,
  value: countParam('コスト', { min: BALANCE.card.costMin, max: B.maxValue, default: 2 }),
  targetRule: 'self',
  minRarity: 'rare',
  basePoints: (e) => B.flat + B.perCost * n(e),
  baseFormula: (e) => `${B.flat}+${n(e)}×${B.perCost}`,
  describe: (e) => `山札の上からコスト${n(e)}以下のカードが出るまでめくり、それを無料で使う`,
  shortValue: (e) => `コスト${n(e)}以下`,
  battle: {
    resolve(rt, e) {
      const deck = rt.player(rt.controller).deck;
      const revealed: string[] = [];
      const names: string[] = [];
      let hit: string | undefined;
      for (const c of deck.slice(0, B.maxReveal)) {
        const def = c.cardId === NOISE_CARD_ID ? undefined : rt.cardDef(c.cardId);
        names.push(rt.cardName(c.cardId));
        if (def && def.cost <= n(e)) {
          hit = c.uid;
          break;
        }
        revealed.push(c.uid);
      }
      if (names.length === 0) {
        rt.log('山札がないので、めくれない');
        return;
      }
      rt.log(`めくったカード：${names.join('、')}`);
      if (!hit) rt.log(`コスト${n(e)}以下のカードは出なかった`);
      rt.deckToBottom(rt.controller, revealed);
      if (hit) rt.freePlayFromDeck(rt.controller, hit);
    },
  },
});
