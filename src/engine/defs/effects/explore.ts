import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';
import { NOISE_CARD_ID } from '../../battle/types.ts';

const B = BALANCE.effects.explore;

// 探検：MTG #448（探検を行う）。山札の一番上を公開する。モンスターなら手札へ、違えば捨て札へ置き、自分のモンスターの攻撃力と体力+N
export default defineEffect({
  id: 'explore',
  name: '探検',
  group: 'buff',
  order: 46.5,
  summary: '山札の一番上を公開する。モンスターなら手札に加え（引いた扱い）、違えば捨て札に置いて自分のモンスター1体の攻撃力と体力+N',
  value: valueParam('上昇量', { default: 1, max: B.maxValue }),
  targetRule: 'allyMonsterOne',
  excludeTargets: ['allyMonsters', 'otherAllies'],
  scalable: true,
  // 対象がいなくても、カードの移動だけは行う
  resolveWithoutTargets: true,
  basePoints: (e) => B.flat + B.perValue * n(e),
  baseFormula: (e) => `${B.flat}+${n(e)}×${B.perValue}`,
  describe: (e, c) => `山札の一番上を公開し、モンスターなら手札に加え、違えば捨て札に置いて${c.target}の攻撃力と体力を+${n(e)}する`,
  battle: {
    resolve(rt, e) {
      const top = rt.player(rt.controller).deck[0];
      if (!top) {
        rt.log('山札がないので、何も起きない');
        return;
      }
      const def = top.cardId === NOISE_CARD_ID ? undefined : rt.cardDef(top.cardId);
      rt.log(`探検：山札の一番上は「${rt.cardName(top.cardId)}」`);
      if (def?.stats) {
        rt.drawSpecific(rt.controller, top.uid);
        return;
      }
      rt.deckToDiscard(rt.controller, [top.uid], '探検');
      for (const t of rt.targets) rt.changeStats(t, n(e), n(e));
    },
  },
});
