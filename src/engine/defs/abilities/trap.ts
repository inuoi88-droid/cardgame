import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';
import { TIMINGS, TRAP_TIMINGS } from '../../options.ts';

const B = BALANCE.abilities.trap;
const when = TRAP_TIMINGS.map((t) => `「${TIMINGS[t].label}」`).join('・');

// 罠：MTG #5（インスタント）のアレンジ。パワーの効果が初めて出たら、そのあとパワーは消える（予約型の罠）
export default defineAbility({
  id: 'trap',
  name: '罠',
  order: 16,
  group: '場・パワー',
  summary: `パワーのカードに付ける：このパワーの効果が初めて出たら、そのあとパワーは消える（相手のターンに働く罠。インスタントの代わり）。パワーの効果は${when}だけ。ポイントはタイミングの倍率の代わりに×${B.timingRate}（能力自体は0pt）`,
  cardTypes: ['power', 'powerAttack'],
  points: () => B.flat,
  formula: () => `0（罠のタイミングの倍率×${B.timingRate}に含む）`,
  displayName: () => '罠',
  describe: () => '罠（効果が1回出たら消える）',
  battle: { trap: true },
});
