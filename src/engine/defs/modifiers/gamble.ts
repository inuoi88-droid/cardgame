import { BALANCE } from '../../balance.ts';
import { defineModifier } from '../../define.ts';

const rates = BALANCE.modifierParams.gambleRates;
const list = rates.map((r) => (r === 1 ? 'そのまま' : `${r}倍`)).join('・');

// ばらつき：MTG #564（アストラル・カード）。数値が「半分・そのまま・1.5倍」のどれかにランダムで決まる（期待値は同じで少し安い）
export default defineModifier({
  id: 'gamble',
  name: 'ばらつき',
  order: 16,
  scope: 'scale',
  requiresScaledValue: true,
  summary: `数値が${list}のどれかにランダムで決まる（効果が出るたび。期待値は同じで少し安い）。量の効果だけ（枚数・ターン数には付けられない）`,
  rate: BALANCE.modifiers.gamble,
  textPrefix: '',
  textSuffix: `（ばらつき：数値は${list}のどれか）`,
});
