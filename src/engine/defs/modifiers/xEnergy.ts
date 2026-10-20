import { BALANCE } from '../../balance.ts';
import { defineModifier } from '../../define.ts';

// X（全力）：MTG #100・#600・#233・#258・#364。使用時・召喚時に残りのエナジーをすべて使い、数値を「N×使ったエナジー」にする
export default defineModifier({
  id: 'xEnergy',
  name: 'X（全力）',
  order: 10,
  scope: 'scale',
  timings: ['play', 'summon'],
  summary: '残りのエナジーをすべて使い、数値を「N×使ったエナジー」にする（使用時・召喚時のみ）',
  rate: BALANCE.modifiers.xEnergy,
  textPrefix: '残りのエナジーをすべて使い、',
  textSuffix: '（数値は使ったエナジー1につき）',
});
