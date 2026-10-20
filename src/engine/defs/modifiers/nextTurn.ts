import { BALANCE } from '../../balance.ts';
import { defineModifier } from '../../define.ts';

// 次のターンに（遅延）：MTG #153（時間カウンター）。効果を予約し、次の自分のターン開始時に発動させる（安くなる）。
// 条件と数値の倍数は予約するときに決まる。X（全力）とは併用できない。1人 battle.maxDelayedPerPlayer 件まで
export default defineModifier({
  id: 'nextTurn',
  name: '次のターンに（遅延）',
  order: 20,
  scope: 'delay',
  timings: ['play', 'summon'],
  summary: `この効果を予約し、次の自分のターン開始時（引いた後）に発動させる。条件は使ったときに判定する（予約は1人${BALANCE.battle.maxDelayedPerPlayer}件まで。X とは併用できない）`,
  rate: BALANCE.modifiers.nextTurn,
  textPrefix: '次の自分のターン開始時に、',
  textSuffix: '',
});
