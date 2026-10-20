import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.channel;

// 魂力：MTG #487。手札からエナジー N を払ってこのカードを捨て、「魂力」の効果を使う（本体と二者択一）
export default defineAbility({
  id: 'channel',
  name: '魂力',
  order: 10,
  group: '手札・捨て札の能力',
  summary: `自分のターンに、手札からエナジーNを払ってこのカードを捨て、「魂力」の効果を使う（カードを使ったことには数えない）。本体と二者択一なので、ポイントは高い方＋低い方×${BALANCE.choice.otherRate}`,
  value: countParam('エナジー', { min: 0, max: B.maxCost, default: 1 }),
  conflicts: ['cycling'],
  requiresTiming: 'channel',
  points: () => B.flat,
  formula: () => '0（「魂力」の効果と二者択一の割引で計算）',
  displayName: (a) => `魂力（エナジー${n(a)}）`,
  describe: (a) => `手札からエナジー${n(a)}を払ってこのカードを捨て、「魂力」の効果を使う`,
  battle: { handAbility: { kind: 'channel', cost: (a) => n(a) } },
});
