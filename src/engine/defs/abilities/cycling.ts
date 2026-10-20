import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';

const B = BALANCE.abilities.cycling;

// サイクリング：MTG #227。手札からエナジーを払ってこのカードを捨て、1枚引く
export default defineAbility({
  id: 'cycling',
  name: 'サイクリング',
  order: 9,
  group: '手札・捨て札の能力',
  summary: `自分のターンに、手札からエナジー${B.cost}を払ってこのカードを捨て、カードを1枚引く（カードを使ったことには数えない）`,
  conflicts: ['channel'],
  points: () => B.flat,
  formula: () => `${B.flat}（固定）`,
  displayName: () => 'サイクリング',
  describe: () => `手札からエナジー${B.cost}を払ってこのカードを捨て、カードを1枚引く`,
  battle: { handAbility: { kind: 'cycling', cost: () => B.cost } },
});
