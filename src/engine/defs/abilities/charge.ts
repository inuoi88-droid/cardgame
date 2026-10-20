import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';
import { CHARGE_DEFAULT_NEED, CHARGE_EVENTS, CHARGE_EVENT_LABEL, chargeSpec } from '../../options.ts';

const B = BALANCE.abilities.charge;
const P = BALANCE.abilities.chargePlan;
const choices = CHARGE_EVENTS.map((id) => ({ id, label: CHARGE_EVENT_LABEL[id] }));

// 蓄積：MTG #154（蓄積カウンター）。パワーに蓄積カウンターがたまり、N 個になると「蓄積がたまったとき」の効果が出て0に戻る
export default defineAbility({
  id: 'charge',
  name: '蓄積',
  order: 15,
  summary: `パワーとして場にある間、選んだ出来事のたびに蓄積が1つたまり（1ターン${BALANCE.battle.maxRepeatTriggersPerTurn}つまで）、N個になると「蓄積がたまったとき」の効果が出て0に戻る。ポイントは「蓄積がたまったとき」の倍率（×${BALANCE.timing.chargedPower}×min(1, 頻度÷N)）`,
  value: countParam('必要数', { min: B.min, max: B.max, default: CHARGE_DEFAULT_NEED }),
  option: { label: 'たまるとき', choices, default: 'turnStart' },
  cardTypes: ['power', 'powerAttack'],
  requiresTiming: 'charged',
  points: () => B.flat,
  formula: (a) => (a.once ? `0（「蓄積がたまったとき」の倍率に含む。プランは×${P.planRate}、最低×${P.planMin}）` : '0（「蓄積がたまったとき」の倍率に含む）'),
  displayName: (a) => `${a.once ? 'プラン・' : ''}蓄積${n(a)}`,
  describe: (a) =>
    `${CHARGE_EVENT_LABEL[chargeSpec([a]).event]}に蓄積が1つたまる（${n(a)}つで「蓄積がたまったとき」${a.once ? '。プラン：たまったら効果を出してパワーは消える' : ''}）`,
  // プラン（MTG #36。△ バッチA）：1回きり
  onceOption: { label: 'プラン（1回きり：たまったら効果を出して消える）' },
  battle: { charge: (a) => chargeSpec([a]) },
});
