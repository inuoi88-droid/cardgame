import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.kicker;

// キッカー：MTG #232。使うときにエナジーを追加で K 払ってもよい。払えば「キッカーを払っていれば」の効果も出る
export default defineAbility({
  id: 'kicker',
  name: 'キッカー',
  order: 13,
  group: '追加の支払い',
  summary: `使うときにエナジーを追加でK払ってもよい。払えば条件「キッカーを払っていれば」の効果も出る（その効果の倍率は ×${BALANCE.conditionByKicker.join('／')}、K＝1／2）`,
  value: countParam('追加エナジー', { min: 1, max: B.maxExtra, default: 1 }),
  points: () => B.flat,
  formula: () => '0（「キッカーを払っていれば」の倍率に含む）',
  displayName: (a) => `キッカー${n(a)}`,
  describe: (a) => `使うときにエナジーを追加で${n(a)}払ってもよい（払えば「キッカーを払っていれば」の効果も出る）`,
  battle: { kickerCost: (a) => n(a) },
});
