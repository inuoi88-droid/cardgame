import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.forecast;

// 予見：MTG #259。自分のターンに1回、手札のこのカードを見せてエナジー K で「予見」の効果を使う。カードは手札に残る
export default defineAbility({
  id: 'forecast',
  name: '予見',
  order: 42,
  group: '手札・捨て札の能力',
  summary: `自分のターンに1回、手札のこのカードを見せてエナジーKで「予見」の効果を使う（カードは手札に残る。カードを使ったことには数えない）。ポイントは「予見」の効果のタイミングの倍率（×${BALANCE.timing.forecast}）`,
  value: countParam('エナジー', { min: 0, max: B.maxCost, default: 1 }),
  requiresTiming: 'forecast',
  points: () => B.flat,
  formula: () => '0（「予見」の効果の倍率に含む）',
  displayName: (a) => `予見（エナジー${n(a)}）`,
  describe: (a) => `手札からエナジー${n(a)}で「予見」の効果を使う（カードは手札に残る。1ターン1回）`,
  battle: { handAbility: { kind: 'forecast', cost: (a) => n(a) } },
});
