import { BALANCE } from '../../balance.ts';
import { defineDrawback, n, valueParam } from '../../define.ts';

const B = BALANCE.drawbacks.blight;

// 枯朽：MTG #472（枯朽を行う）。自分のモンスター1体を選び、攻撃力と体力を−N（召喚時は自分以外。いなければ使えない）
export default defineDrawback({
  id: 'blight',
  name: '枯朽',
  order: 18,
  summary: '自分のモンスター1体を選び、攻撃力と体力を−Nする（体力0で破壊。ダメージではない。召喚時は自分以外。いなければ使えない。使用時・召喚時だけ）',
  value: valueParam('量', { default: 1, max: B.maxValue }),
  timings: ['play', 'summon'],
  basePoints: (d) => B.perValue * n(d),
  baseFormula: (d) => `${n(d)}×${B.perValue}`,
  describe: (d) => `自分のモンスター1体の攻撃力と体力を−${n(d)}する（いなければ使えない）`,
  battle: {
    canPlay(g, p) {
      return g.players[p].board.length === 0 ? '枯朽にするモンスターがいません' : null;
    },
    choose(rt) {
      // 召喚時なら、出たモンスター自身は選べない
      const self = rt.src.kind === 'monster' ? rt.src.uid : null;
      return {
        prompt: '枯朽させる（攻撃力と体力を下げる）自分のモンスターを選んでください',
        options: rt
          .player(rt.controller)
          .board.filter((m) => m.uid !== self)
          .map((m) => ({ id: m.uid, label: rt.cardName(m.card.cardId), cardId: m.card.cardId })),
        min: 1,
        max: 1,
      };
    },
    resolve(rt, d, picks) {
      const uid = picks?.[0];
      const m = uid ? rt.monster({ kind: 'monster', uid }) : undefined;
      if (!m || m.controller !== rt.controller) {
        rt.log('枯朽にするモンスターがいない');
        return;
      }
      rt.changeStats({ kind: 'monster', uid: m.uid }, -n(d), -n(d));
    },
  },
});
