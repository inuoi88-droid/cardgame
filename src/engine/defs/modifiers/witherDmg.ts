import { BALANCE } from '../../balance.ts';
import { defineModifier } from '../../define.ts';

// 萎縮：MTG #282。このダメージでモンスターが減らした体力のぶん、最大体力も減る（修理・自己修復で戻らない）
export default defineModifier({
  id: 'witherDmg',
  name: '萎縮',
  order: 3,
  scope: 'damage',
  summary: 'このダメージでモンスターが減らした体力のぶん、最大体力も減る（修理・自己修復・回復で戻らない。プレイヤーには働かない）',
  rate: BALANCE.modifiers.witherDmg,
  textPrefix: '',
  textSuffix: '（萎縮：減った体力のぶん最大体力も減る）',
});
