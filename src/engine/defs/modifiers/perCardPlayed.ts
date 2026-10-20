import { BALANCE } from '../../balance.ts';
import { defineModifier } from '../../define.ts';

const cap = BALANCE.modifierParams.scaleCountCap;

// このターン使ったカード1枚につき：MTG #241。数値を「N×このターンに使ったカードの枚数（このカードを含む、上限あり）」にする
export default defineModifier({
  id: 'perCardPlayed',
  name: 'このターン使ったカード1枚につき',
  order: 12,
  scope: 'scale',
  timings: ['play', 'summon', 'attack', 'turnEnd', 'cardPlayed', 'skillPlayed', 'powerPlayed', 'allySummoned'],
  summary: `数値を「N×このターンに使ったカードの枚数（このカードを含む、最大${cap}）」にする。相手のターンには不発`,
  rate: BALANCE.modifiers.perCardPlayed,
  textPrefix: '',
  textSuffix: `（数値はこのターン使ったカード1枚につき、最大${cap}枚）`,
});
