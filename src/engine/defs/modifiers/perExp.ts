import { BALANCE } from '../../balance.ts';
import { defineModifier } from '../../define.ts';

const cap = BALANCE.modifierParams.expCountCap;

// 経験1につき：MTG #152（経験カウンター）。数値を「N×自分の経験の数（上限あり）」にする
export default defineModifier({
  id: 'perExp',
  name: '経験1につき',
  order: 15,
  scope: 'scale',
  summary: `数値を「N×自分の経験の数（最大${cap}）」にする。経験が0なら不発（経験は効果「経験を得る」で増え、試合中ずっと残る）`,
  rate: BALANCE.modifiers.perExp,
  textPrefix: '',
  textSuffix: `（数値は自分の経験1につき、最大${cap}）`,
});
