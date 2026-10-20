import { BALANCE } from '../../balance.ts';
import { defineModifier } from '../../define.ts';

const cap = BALANCE.modifierParams.scaleCountCap;

// 相手モンスター1体につき：MTG #221。数値を「N×相手の場のモンスターの数（上限あり）」にする
export default defineModifier({
  id: 'perEnemyMonster',
  name: '相手モンスター1体につき',
  order: 11,
  scope: 'scale',
  summary: `数値を「N×相手の場のモンスターの数（最大${cap}）」にする。相手のモンスターがいなければ不発`,
  rate: BALANCE.modifiers.perEnemyMonster,
  textPrefix: '',
  textSuffix: `（数値は相手モンスター1体につき、最大${cap}体）`,
});
