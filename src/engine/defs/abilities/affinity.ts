import { BALANCE } from '../../balance.ts';
import { defineAbility, optionOf } from '../../define.ts';

const B = BALANCE.abilities.affinity;

const OPTION = {
  label: '数えるもの',
  choices: [
    { id: 'monsters', label: '自分の場のモンスター1体につき' },
    { id: 'cardsPlayed', label: 'このターン使ったカード1枚につき' },
  ],
  default: 'monsters',
} as const;

const steps = (cost: number | undefined) => Math.max(0, Math.min(B.maxReduction, (cost ?? 0) - B.minCost));
const what = (a: { option?: string }) => (optionOf({ option: OPTION }, a) === 'cardsPlayed' ? 'このターン使ったカード1枚' : '自分の場のモンスター1体');

// 親和：MTG #242・#608（条件付きコスト軽減）。自分の場のモンスター1体（またはこのターン使ったカード1枚）につきコスト−1
export default defineAbility({
  id: 'affinity',
  name: '親和',
  order: 11,
  group: 'コスト',
  summary: `自分の場のモンスター1体（またはこのターン使ったカード1枚）につきコスト−1（最大−${B.maxReduction}、コストは${B.minCost}まで）。印刷コスト${B.minPrintedCost}以上のカードだけ（軽くなるのは${B.minCost + 1}以上）`,
  option: OPTION,
  points: (_a, ctx) => B.perStep * steps(ctx.card.cost),
  formula: (_a, ctx) => `${B.perStep}×${steps(ctx.card.cost)}`,
  displayName: () => '親和',
  describe: (a) => `${what(a)}につきコスト−1（最大−${B.maxReduction}、コストは${B.minCost}まで）`,
  battle: {
    reduce: (a, ctx) => {
      const ps = ctx.g.players[ctx.p];
      const count = optionOf({ option: OPTION }, a) === 'cardsPlayed' ? ps.turn.cardsPlayed : ps.board.length;
      return { amount: Math.min(count, B.maxReduction), min: B.minCost };
    },
  },
});
