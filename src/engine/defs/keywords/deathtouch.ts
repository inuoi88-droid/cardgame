import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';
import { ceilPoints } from '../../math.ts';

const B = BALANCE.keywords.deathtouch;

// 接死：MTG #197。攻撃・反撃・格闘でダメージを与えたモンスターを破壊する（聖盾で0なら働かない。貫通の余り・効果のダメージには働かない）
export default defineKeyword({
  id: 'deathtouch',
  name: '接死',
  order: 9,
  summary: 'このモンスターが攻撃・反撃・格闘でダメージを与えたモンスターは破壊される（不屈でも踏みとどまれない）',
  // 反撃でも働くので、体力が高いほど高い（決定事項 #89）
  points: (_k, s) => Math.max(B.flat, ceilPoints(B.perHp * s.hp)),
  formula: (_k, s) => `max(${B.flat}, 体力${s.hp}×${B.perHp})`,
  displayName: () => '接死',
  describe: () => 'このモンスターが攻撃・反撃・格闘でダメージを与えたモンスターは破壊される',
  battle: { deathtouch: true },
});
