import { BALANCE } from '../../balance.ts';
import { defineModifier } from '../../define.ts';

const cap = BALANCE.modifierParams.discardCountCap;

// 捨て札のモンスター1枚につき：MTG #533（宿根）。数値を「N×自分の捨て札のモンスターカードの枚数（上限あり）」にする
export default defineModifier({
  id: 'perDiscardMonster',
  name: '捨て札のモンスター1枚につき',
  order: 13,
  scope: 'scale',
  summary: `数値を「N×自分の捨て札のモンスターカードの枚数（最大${cap}）」にする。0枚なら不発`,
  rate: BALANCE.modifiers.perDiscardMonster,
  textPrefix: '',
  textSuffix: `（数値は捨て札のモンスター1枚につき、最大${cap}枚）`,
});
