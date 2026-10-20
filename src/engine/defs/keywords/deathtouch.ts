import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.deathtouch;

// 接死：MTG #197。攻撃・反撃・格闘でダメージを与えたモンスターを破壊する（聖盾で0なら働かない。貫通の余り・効果のダメージには働かない）
export default defineKeyword({
  id: 'deathtouch',
  name: '接死',
  order: 9,
  summary: 'このモンスターが攻撃・反撃・格闘でダメージを与えたモンスターは破壊される（不屈でも踏みとどまれない）',
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '接死',
  describe: () => 'このモンスターが攻撃・反撃・格闘でダメージを与えたモンスターは破壊される',
  battle: { deathtouch: true },
});
