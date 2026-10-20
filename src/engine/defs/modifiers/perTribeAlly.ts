import { BALANCE } from '../../balance.ts';
import { defineModifier } from '../../define.ts';

const cap = BALANCE.modifierParams.scaleCountCap;

// 同じ種族の自分のモンスター1体につき：MTG #53（部族シナジー）。数値を「N×このカードと同じ種族の自分のモンスターの数（自分自身を含む・上限あり）」にする
export default defineModifier({
  id: 'perTribeAlly',
  name: '同じ種族の自分のモンスター1体につき',
  order: 14,
  scope: 'scale',
  summary: `数値を「N×このカードと同じ種族の自分の場のモンスターの数（自分自身を含む。最大${cap}体）」にする。0体なら不発。種族のあるカードだけ`,
  rate: BALANCE.modifiers.perTribeAlly,
  textPrefix: '',
  textSuffix: `（数値は同じ種族の自分のモンスター1体につき、最大${cap}体）`,
});
