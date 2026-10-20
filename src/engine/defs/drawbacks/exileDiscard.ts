import { BALANCE } from '../../balance.ts';
import { countParam, defineDrawback, n, optionOf, type ParamSpec } from '../../define.ts';
import type { CardInst, GameState } from '../../battle/types.ts';
import type { DrawbackInstance } from '../../types.ts';

const B = BALANCE.drawbacks.exileDiscard;

const COUNT: ParamSpec = countParam('枚数', { min: 1, max: B.maxCount, default: 3 });
const COST: ParamSpec = countParam('コスト合計', { min: 2, max: B.maxCost, default: 4 });

const OPTION = {
  label: '数え方',
  choices: [
    { id: 'count', label: '枚数（給餌）' },
    { id: 'costSum', label: 'コストの合計（証拠収集）' },
  ],
  default: 'count',
} as const;

const isCost = (d: DrawbackInstance) => optionOf({ option: OPTION }, d) === 'costSum';
const costOf = (g: GameState, c: CardInst) => g.cards[c.cardId]?.cost ?? 0;

// 捨て札の除外：MTG #463・#465（証拠収集を行う・給餌する）。使うとき、自分の捨て札からカードを除外する（足りなければ使えない）
export default defineDrawback({
  id: 'exileDiscard',
  name: '捨て札の除外',
  order: 19,
  summary: `使うとき、自分の捨て札からカードを除外する。枚数（給餌：N枚）か、コストの合計（証拠収集：合計N以上）を選ぶ。足りなければ使えない（使用時・召喚時だけ）`,
  value: COUNT,
  option: OPTION,
  valueFor: (d) => (isCost(d) ? COST : COUNT),
  timings: ['play', 'summon'],
  basePoints: (d) => (isCost(d) ? B.perCost : B.perCard) * n(d),
  baseFormula: (d) => `${n(d)}×${isCost(d) ? B.perCost : B.perCard}`,
  describe: (d) => (isCost(d) ? `捨て札からコストの合計が${n(d)}以上になるようにカードを除外する` : `捨て札を${n(d)}枚除外する`),
  battle: {
    canPlay(g, p, card) {
      const d = g.cards[card.cardId]?.drawbacks.find((x) => x.id === 'exileDiscard');
      if (!d) return null;
      const discard = g.players[p].discard;
      const have = isCost(d) ? discard.reduce((s, c) => s + costOf(g, c), 0) : discard.length;
      return have < n(d) ? '捨て札が足りません' : null;
    },
    choose(rt, d) {
      const discard = rt.player(rt.controller).discard;
      const need = n(d);
      const options = discard.map((c) => ({ id: c.uid, label: `${rt.cardName(c.cardId)}（コスト${rt.cardDef(c.cardId)?.cost ?? 0}）`, cardId: c.cardId }));
      if (isCost(d)) {
        return { prompt: `除外する捨て札を選んでください（コストの合計が${need}以上。足りなければ古い順に足します）`, options, min: 1, max: options.length };
      }
      const k = Math.min(need, options.length);
      return { prompt: `除外する捨て札を${k}枚選んでください`, options, min: k, max: k };
    },
    resolve(rt, d, picks) {
      const p = rt.controller;
      const need = n(d);
      const chosen = new Set(picks ?? []);
      const discard = rt.player(p).discard;
      const list = discard.filter((c) => chosen.has(c.uid));
      if (isCost(d)) {
        // コストの合計が足りなければ、残りから古い順に足す
        let sum = list.reduce((s, c) => s + (rt.cardDef(c.cardId)?.cost ?? 0), 0);
        if (sum < need) {
          for (const c of discard) {
            if (sum >= need) break;
            if (chosen.has(c.uid)) continue;
            list.push(c);
            sum += rt.cardDef(c.cardId)?.cost ?? 0;
          }
          rt.log(`コストの合計が${need}に届かないので、古い順に足した`);
        }
      } else if (list.length < need) {
        for (const c of discard) {
          if (list.length >= need) break;
          if (!chosen.has(c.uid)) list.push(c);
        }
      }
      for (const c of list) rt.exileCard(p, c.uid);
    },
  },
});
