import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.renew;

// 相続：MTG #524。自分のターンに、捨て札にあるこのカードをエナジー K で除外して「相続」の効果を使う
export default defineAbility({
  id: 'renew',
  name: '相続',
  order: 39,
  group: '手札・捨て札の能力',
  summary: `自分のターンに、捨て札にあるこのカードをエナジーKで除外して「相続」の効果を使う（カードを使ったことには数えない）。ポイントは「相続」の効果のタイミングの倍率（×${BALANCE.timing.renew}）`,
  value: countParam('エナジー', { min: 0, max: B.maxCost, default: 1 }),
  requiresTiming: 'renew',
  points: () => B.flat,
  formula: () => '0（「相続」の効果の倍率に含む）',
  displayName: (a) => `相続（エナジー${n(a)}）`,
  describe: (a) => `捨て札からエナジー${n(a)}でこのカードを除外して、「相続」の効果を使う`,
  battle: { discardAbility: { kind: 'renew', cost: (a) => n(a) } },
});
