import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.dredge;

// 発掘：MTG #254。自分のターンに、山札の上 N 枚を捨て札に置いて、捨て札にあるこのカードを手札に戻せる（1ターン1回）
export default defineAbility({
  id: 'dredge',
  name: '発掘',
  order: 40,
  group: '手札・捨て札の能力',
  summary: `自分のターンに、山札の上N枚を捨て札に置いて、捨て札にあるこのカードを手札に戻せる（エナジー不要・1人1ターン${BALANCE.battle.maxDredgePerTurn}回。山札がN枚以上のときだけ）`,
  value: countParam('枚数', { min: B.minCount, max: B.maxCount, default: B.minCount }),
  points: () => B.flat,
  formula: () => `${B.flat}（固定）`,
  displayName: (a) => `発掘${n(a)}`,
  describe: (a) => `山札の上${n(a)}枚を捨て札に置き、捨て札のこのカードを手札に戻す`,
  battle: { discardAbility: { kind: 'dredge', cost: () => 0 } },
});
